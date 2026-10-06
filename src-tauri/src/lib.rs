mod binresolve;
mod download;
mod fetch;
mod probe;

use probe::RawJson;
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::State;

/// 运行中的任务句柄表，用于取消。
#[derive(Default)]
struct Tasks(Mutex<HashMap<String, download::DownloadHandle>>);

/// 用户设置。前端负责持久化，这里是内存副本。
/// 必须能 Serialize —— 它同时也是 get_settings 命令的返回值。
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// 用户手动指定的 yt-dlp 路径（可选，优先级最高）
    pub ytdlp_path: Option<String>,
    /// 用户手动指定的 ffmpeg 路径（可选）
    pub ffmpeg_path: Option<String>,
}

#[tauri::command]
fn get_settings(settings: State<'_, Settings>) -> Settings {
    settings.inner().clone()
}

/// 一次性拿到两个组件的状态。前端启动时调一次。
#[tauri::command]
fn core_status(settings: State<'_, Settings>) -> Vec<binresolve::ComponentStatus> {
    vec![
        binresolve::detect_ytdlp(settings.ytdlp_path.as_deref()),
        binresolve::detect_ffmpeg(settings.ffmpeg_path.as_deref()),
    ]
}

/// 批量探测：逐条返回，失败的单独标错不中断整批。
#[tauri::command]
async fn probe_batch(
    urls: Vec<String>,
    settings: State<'_, Settings>,
) -> Result<Vec<BatchResult>, String> {
    // async 命令里 State 只能借用一次，这里先取出可复用的副本。
    let cfg = settings.inner().clone();
    let mut out = Vec::with_capacity(urls.len());
    for u in urls {
        let r = match probe_one(&u, &cfg) {
            Ok(info) => BatchResult { url: u, info: Some(info), error: None },
            Err(e) => BatchResult { url: u, info: None, error: Some(e) },
        };
        out.push(r);
    }
    Ok(out)
}

/// 探测单条链接的内部实现。返回结构化结果或用户可读的错误。
fn probe_one(url: &str, settings: &Settings) -> Result<probe::MediaInfo, String> {
    let ytdlp = binresolve::ytdlp_path(settings.ytdlp_path.as_deref())?;

    let out = Command::new(&ytdlp)
        .arg("--dump-single-json")
        .arg("--flat-playlist")
        .arg("--no-playlist")
        .arg("--no-warnings")
        .arg(url)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("无法启动 yt-dlp：{}", e))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(probe::explain_error(&err));
    }

    let raw: RawJson = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("解析 yt-dlp 输出失败：{}", e))?;

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
    let handle = download::start(app, id.clone(), opts)?;
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
async fn fetch_component(app: tauri::AppHandle, name: String) -> Result<(), String> {
    fetch::fetch(app, name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Tasks::default())
        .manage(Settings::default())
        .invoke_handler(tauri::generate_handler![
            core_status,
            get_settings,
            probe_batch,
            start_download,
            cancel_download,
            fetch_component
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}