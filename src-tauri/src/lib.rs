mod binresolve;
mod compatibility;
mod disk;
mod download;
mod errcode;
mod fetch;
mod pathcheck;
mod probe;
mod thumb;

use probe::RawJson;
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

/// 运行中的任务句柄表，用于取消；任务终结时由等待线程回调清理（TD-DL-008）。
#[derive(Clone, Default)]
struct Tasks(Arc<Mutex<HashMap<String, download::DownloadHandle>>>);

/// 用户设置。前端负责持久化，这里是后端内存副本；
/// 前端在启动与保存时通过 set_settings 同步——探测、组件检测、下载三个入口
/// 必须看到同一份设置（TD-CORE-001）。
/// 必须能 Serialize —— 它同时也是 get_settings 命令的返回值。
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// 用户手动指定的 yt-dlp 路径（可选，优先级最高）
    pub ytdlp_path: Option<String>,
    /// 用户手动指定的 ffmpeg 路径（可选）
    pub ffmpeg_path: Option<String>,
    /// Cookie 模式：none / browser / file（产品规格见 docs/product-specs/cookie-access.md）
    #[serde(default)]
    pub cookie_mode: Option<String>,
    /// cookie_mode = browser 时使用的浏览器名
    #[serde(default)]
    pub cookie_browser: Option<String>,
    /// cookie_mode = file 时的 cookies.txt 路径
    #[serde(default)]
    pub cookie_file: Option<String>,
}

#[tauri::command]
fn get_settings(settings: State<'_, Mutex<Settings>>) -> Settings {
    settings.lock().unwrap().clone()
}

#[tauri::command]
fn set_settings(settings: State<'_, Mutex<Settings>>, new_settings: Settings) {
    *settings.lock().unwrap() = new_settings;
}

/// 一次性拿到两个组件的状态。前端启动时调一次。
#[tauri::command]
fn core_status(settings: State<'_, Mutex<Settings>>) -> Vec<binresolve::ComponentStatus> {
    let cfg = settings.lock().unwrap().clone();
    vec![
        binresolve::detect(&binresolve::YTDLP, cfg.ytdlp_path.as_deref()),
        binresolve::detect(&binresolve::FFMPEG, cfg.ffmpeg_path.as_deref()),
    ]
}

/// 批量探测：逐条返回，失败的单独标错不中断整批。
///
/// 有界并发（4）+ spawn_blocking——原实现串行且在 async 上下文里直接跑阻塞 IO，
/// 会卡住 tokio worker 且 N 条链接总延时为各条之和（TD-PROBE-002）。
#[tauri::command]
async fn probe_batch(
    urls: Vec<String>,
    settings: State<'_, Mutex<Settings>>,
) -> Result<Vec<BatchResult>, String> {
    let cfg = settings.lock().unwrap().clone();
    let sem = Arc::new(tokio::sync::Semaphore::new(4));
    let mut handles = Vec::with_capacity(urls.len());
    for u in urls {
        let permit = sem
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| format!("并发信号量不可用：{e}"))?;
        let cfg = cfg.clone();
        handles.push(tokio::task::spawn_blocking(move || {
            let r = match probe_one(&u, &cfg) {
                Ok(info) => BatchResult {
                    url: u.clone(),
                    info: Some(info),
                    error: None,
                    error_code: None,
                },
                Err(f) => BatchResult {
                    url: u.clone(),
                    info: None,
                    error: Some(f.summary.to_string()),
                    error_code: Some(f.code.to_string()),
                },
            };
            drop(permit);
            r
        }));
    }

    let mut out = Vec::with_capacity(handles.len());
    for h in handles {
        match h.await {
            Ok(r) => out.push(r),
            Err(e) => out.push(BatchResult {
                url: String::new(),
                info: None,
                error: Some(format!("探测任务异常：{e}")),
                error_code: Some("Unknown".into()),
            }),
        }
    }
    Ok(out)
}

/// 探测单条链接的内部实现。
///
/// 失败时回 `Classified`（错误码 + 摘要）而非裸字符串——前端要按错误码渲染
/// 跟随界面语言的多行解释（TD-PROBE-006），拿不到 code 就只能显示后端写死的中文。
fn probe_one(
    url: &str,
    settings: &Settings,
) -> Result<probe::MediaInfo, crate::errcode::Classified> {
    let ytdlp = binresolve::ytdlp_path(settings.ytdlp_path.as_deref()).map_err(|e| unknown(&e))?;

    let mut cmd = Command::new(&ytdlp);
    cmd.arg("--dump-single-json")
        .arg("--flat-playlist")
        .arg("--no-playlist")
        .arg("--no-warnings");
    // 登录墙闭环（TD-PROBE-001）：探测与下载吃同一份 Cookie 设置
    // probe_args 额外带上平台兼容参数（TD-PROBE-005：YouTube 登录态需换客户端，
    // 否则 tv_downgraded 解不开签名 → "The page needs to be reloaded"）
    for a in probe::probe_args(
        url,
        settings.cookie_mode.as_deref(),
        settings.cookie_browser.as_deref(),
        settings.cookie_file.as_deref(),
    ) {
        cmd.arg(a);
    }
    cmd.arg(url).stdin(Stdio::null());

    let out = cmd
        .output()
        .map_err(|e| unknown(&format!("无法启动 yt-dlp：{e}")))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(errcode::classify(&err));
    }

    let raw: RawJson = serde_json::from_slice(&out.stdout)
        .map_err(|e| unknown(&format!("解析 yt-dlp 输出失败：{e}")))?;

    Ok(probe::parse(raw, url))
}

/// 内部错误（组件缺失、JSON 解析失败）统一归到 Unknown——
/// 它们不是平台侧错误，让用户看到「未知错误」比看到误导性的分类更诚实。
fn unknown(summary: &str) -> errcode::Classified {
    errcode::Classified {
        code: "Unknown",
        summary: summary.to_string(),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchResult {
    url: String,
    info: Option<probe::MediaInfo>,
    /// 用户可读的摘要（中文一行，进状态栏与任务行）
    error: Option<String>,
    /// 稳定错误码（TD-PROBE-006）：前端按它渲染多行 tips 解释——文案在前端，
    /// 才能跟随界面语言（TD-FE-019）。Unknown 时前端回落通用解释。
    error_code: Option<String>,
}

#[tauri::command]
async fn start_download(
    app: tauri::AppHandle,
    tasks: State<'_, Tasks>,
    id: String,
    opts: download::DownloadOptions,
) -> Result<(), String> {
    // 任务终结（成败皆然）时从表中移除句柄，避免慢性泄漏（TD-DL-008）
    let cleanup_tasks = tasks.inner().clone();
    let cleanup_id = id.clone();
    let handle = download::start(app, id.clone(), opts, move || {
        cleanup_tasks.0.lock().unwrap().remove(&cleanup_id);
    })?;
    tasks.0.lock().unwrap().insert(id, handle);
    Ok(())
}

#[tauri::command]
fn cancel_download(tasks: State<'_, Tasks>, id: String) {
    if let Some(h) = tasks.0.lock().unwrap().remove(&id) {
        h.cancel();
    }
}

/// 用系统默认程序打开文件(完成的视频交系统播放器,TD-FE-012)
#[tauri::command]
fn open_with_system(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(&path).spawn();
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer").arg(&path).spawn();
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(&path).spawn();
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let result = Err("不支持的平台".into());
    result.map(|_| ()).map_err(|e| format!("无法打开: {e}"))
}

/// 在系统文件管理器中定位文件(Finder「显示原身」,TD-FE-012)
#[tauri::command]
fn reveal_in_manager(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let result = Command::new("open").args(["-R", &path]).spawn();
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer")
        .arg(format!("/select,{path}"))
        .spawn();
    #[cfg(target_os = "linux")]
    let result = match std::path::Path::new(&path).parent() {
        Some(dir) => Command::new("xdg-open").arg(dir).spawn(),
        None => Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "无父目录",
        )),
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let result = Err("不支持的平台".into());
    result.map(|_| ()).map_err(|e| format!("无法定位: {e}"))
}

/// 设置弹层的路径检测：手贴的组件路径/下载目录，存在 + 版本合适才通过（TD-FE-010）
#[tauri::command]
fn check_component(name: String, path: String) -> pathcheck::CheckResult {
    pathcheck::check_candidate(&name, std::path::Path::new(&path))
}

/// 完成视频的本地缩略图（TD-FE-024）。
///
/// 返回抽帧后的**磁盘路径**（不是 URL）：前端拿路径调 `convertFileSrc` 转成
/// `asset://localhost/...`。这里刻意不自己拼 URL —— asset protocol 只处理
/// `asset://`，返回 `file://` 会被 CSP 的 `media-src`/`img-src` 拦掉，
/// 表现为「图片和视频都不显示」且毫无报错。
///
/// 失败时返回 Err 而不是 panic：缩略图是锦上添花，前端会回落到远端封面或占位图。
#[tauri::command]
fn video_thumbnail(
    app: AppHandle,
    settings: State<'_, Mutex<Settings>>,
    path: String,
) -> Result<String, String> {
    let ffmpeg = {
        let cfg = settings.lock().unwrap().clone();
        binresolve::ffmpeg_path(cfg.ffmpeg_path.as_deref())
    };
    let p = std::path::Path::new(&path);
    let thumb = thumb::ensure_thumb(p, ffmpeg.as_deref())?;
    allow_file(&app, &thumb)?;
    Ok(thumb.to_string_lossy().into_owned())
}

/// 把本地文件授权进 asset scope，返回其**磁盘路径**（TD-FE-024/025）。
///
/// 播放器与缩略图都要让 WebView 直读本地文件。走 asset protocol 而不是自建
/// HTTP 服务：它**支持 Range/206**（tauri protocol/asset.rs），进度条拖动与
/// 断点读取由上游实现，我们不重复造。
///
/// 安全边界：scope 配置默认为空，每次只放行**用户明确点开的那一个文件**，
/// 不整目录放开——避免 WebView 侧任何注入面读到用户其他文件。
///
/// 返回路径而非 URL：前端统一经 `convertFileSrc` 转换（见 video_thumbnail 注释）。
#[tauri::command]
fn local_media_url(app: AppHandle, path: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(&path);
    if !p.is_file() {
        return Err(format!("文件不存在：{path}"));
    }
    allow_file(&app, &p)?;
    Ok(path)
}

fn allow_file(app: &AppHandle, path: &std::path::Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_file(path)
        .map_err(|e| format!("授权文件失败：{e}"))
}

/// 下载缺失组件到 ~/.tikdown
#[tauri::command]
async fn fetch_component(
    app: tauri::AppHandle,
    fetching: State<'_, fetch::Fetching>,
    name: String,
) -> Result<(), String> {
    fetch::fetch(app, fetching, name)
}

/// 下载目录所在卷的剩余空间（字节）；查询失败时前端显示占位符（TD-CORE-010）
#[tauri::command]
fn disk_free(path: String) -> Result<u64, String> {
    disk::free_space(std::path::Path::new(&path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Tasks::default())
        .manage(Mutex::new(Settings::default()))
        .manage(fetch::Fetching::default())
        .invoke_handler(tauri::generate_handler![
            core_status,
            get_settings,
            set_settings,
            probe_batch,
            start_download,
            cancel_download,
            fetch_component,
            check_component,
            open_with_system,
            reveal_in_manager,
            disk_free,
            video_thumbnail,
            local_media_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
