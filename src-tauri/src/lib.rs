mod binresolve;
mod download;
mod fetch;
mod probe;

use probe::RawJson;
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::State;

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
                },
                Err(e) => BatchResult {
                    url: u.clone(),
                    info: None,
                    error: Some(e),
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
            }),
        }
    }
    Ok(out)
}

/// 探测单条链接的内部实现。返回结构化结果或用户可读的错误。
fn probe_one(url: &str, settings: &Settings) -> Result<probe::MediaInfo, String> {
    let ytdlp = binresolve::ytdlp_path(settings.ytdlp_path.as_deref())?;

    let mut cmd = Command::new(&ytdlp);
    cmd.arg("--dump-single-json")
        .arg("--flat-playlist")
        .arg("--no-playlist")
        .arg("--no-warnings");
    // 登录墙闭环（TD-PROBE-001）：探测与下载吃同一份 Cookie 设置
    for a in probe::cookie_args(
        settings.cookie_mode.as_deref(),
        settings.cookie_browser.as_deref(),
        settings.cookie_file.as_deref(),
    ) {
        cmd.arg(a);
    }
    cmd.arg(url).stdin(Stdio::null());

    let out = cmd
        .output()
        .map_err(|e| format!("无法启动 yt-dlp：{}", e))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(probe::explain_error(&err));
    }

    let raw: RawJson =
        serde_json::from_slice(&out.stdout).map_err(|e| format!("解析 yt-dlp 输出失败：{}", e))?;

    Ok(probe::parse(raw, url))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchResult {
    url: String,
    info: Option<probe::MediaInfo>,
    error: Option<String>,
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

/// 下载缺失组件到 ~/.tikdown
#[tauri::command]
async fn fetch_component(
    app: tauri::AppHandle,
    fetching: State<'_, fetch::Fetching>,
    name: String,
) -> Result<(), String> {
    fetch::fetch(app, fetching, name)
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
            fetch_component
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
