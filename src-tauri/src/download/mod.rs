use crate::binresolve;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

mod args;
mod progress;

use args::{build_command, PROGRESS_PREFIX};

/// 任务状态机。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum TaskEvent {
    Starting,
    /// 已落盘的字节与总量
    Progress {
        percent: f64,
        downloaded: u64,
        total: u64,
        speed: String,
        eta: String,
        filename: String,
    },
    Merging,
    Done {
        path: String,
    },
    Failed {
        message: String,
    },
}

/// 注意：字段为 camelCase 序列化——前端 invoke 传参就是 camelCase（TD-DL-001）。
/// 缺了这个 rename_all，`targetDir` 反序列化进 `target_dir` 必然失败，所有下载全挂。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptions {
    pub url: String,
    pub target_dir: String,
    /// 指定画质对应的 format id；None 表示自动选最优
    pub format_id: Option<String>,
    /// 读取本机浏览器登录态（应对登录墙）
    pub use_cookies: bool,
    /// 浏览器名：chrome / firefox / safari / edge / brave
    pub browser: Option<String>,
    /// 用户在设置里指定的组件路径
    pub settings: crate::Settings,
}

pub struct DownloadHandle {
    cancel_flag: Arc<AtomicBool>,
    /// 子进程槽位：等待线程轮询 try_wait；取消方取走并 kill。
    child: Arc<Mutex<Option<std::process::Child>>>,
}

impl DownloadHandle {
    /// 取消 = 置标志 + kill 子进程（TD-DL-002）。
    /// 原实现只置标志：读线程退出后管道写满，yt-dlp 阻塞假死，
    /// 等待线程的 wait() 永不返回，「已取消」事件永远发不出来。
    pub fn cancel(&self) {
        self.cancel_flag.store(true, Ordering::Relaxed);
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

/// 执行下载。事件通过 Tauri 事件总线推给前端。
///
/// `on_finish` 在任务终结时被调用（无论成败），供命令层清理任务表（TD-DL-008）。
pub fn start(
    app: AppHandle,
    id: String,
    opts: DownloadOptions,
    on_finish: impl FnOnce() + Send + 'static,
) -> Result<DownloadHandle, String> {
    let ytdlp = binresolve::ytdlp_path(opts.settings.ytdlp_path.as_deref())?;
    let ffmpeg = binresolve::ffmpeg_path(opts.settings.ffmpeg_path.as_deref());

    let mut cmd = build_command(&ytdlp, &opts, ffmpeg.as_deref());

    // Unix 下隐藏终端窗口（Windows 用 CREATE_NO_WINDOW）
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| format!("无法启动 yt-dlp：{e}"))?;

    let stdout = child.stdout.take().ok_or("无法读取 yt-dlp 输出")?;
    let stderr = child.stderr.take().ok_or("无法读取 yt-dlp 错误输出")?;

    let cancel_flag = Arc::new(AtomicBool::new(false));
    let child_slot: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(Some(child)));
    let handle = DownloadHandle { cancel_flag: cancel_flag.clone(), child: child_slot.clone() };

    // 开跑先报一声，前端立即把任务置为「下载中」而不是停在「待下载」
    let _ = emit_event(&app, &id, TaskEvent::Starting);

    // 进度线程：解析 stdout；被取消时提前退出（子进程已被 kill，管道随即关闭）
    let cancel_progress = cancel_flag.clone();
    let (emit_p, id_p) = (app.clone(), id.clone());
    let (final_tx, final_rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if cancel_progress.load(Ordering::Relaxed) {
                break;
            }
            // --print after_move 给出的最终落盘路径
            if let Some(rest) = line.strip_prefix(args::FINAL_PREFIX) {
                let _ = final_tx.send(rest.trim().to_string());
                continue;
            }
            if let Some(evt) = progress::parse(&line) {
                let _ = emit_event(&emit_p, &id_p, evt);
            }
        }
    });

    // stderr 线程：监听合并阶段 + 攒错误行；结束后通过 channel 交出缓冲（TD-DL-007，
    // 原实现靠 sleep(120ms) 猜测 stderr 读完，慢速输出时尾行会丢）。
    let cancel_err = cancel_flag.clone();
    let (emit_e, id_e) = (app.clone(), id.clone());
    let (err_tx, err_rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let mut buf = String::new();
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if cancel_err.load(Ordering::Relaxed) {
                break;
            }
            if line.contains("[Merger]") || line.contains("Merging formats") {
                let _ = emit_event(&emit_e, &id_e, TaskEvent::Merging);
            }
            buf.push_str(&line);
            buf.push('\n');
        }
        let _ = err_tx.send(buf);
    });

    // 等待线程：轮询 try_wait（子进程槽位为空 = 已被取消逻辑 kill）
    let cancel_wait = cancel_flag.clone();
    let (emit_w, id_w) = (app.clone(), id.clone());
    std::thread::spawn(move || {
        let status: std::io::Result<std::process::ExitStatus> = loop {
            let res = {
                let mut slot = child_slot.lock().unwrap();
                match slot.as_mut() {
                    Some(c) => c.try_wait(),
                    // 槽位为空 = 子进程已被 cancel 取走并 kill
                    None => {
                        break Err(std::io::Error::new(std::io::ErrorKind::NotFound, "cancelled"))
                    }
                }
            };
            match res {
                Ok(Some(s)) => break Ok(s),
                Ok(None) => std::thread::sleep(Duration::from_millis(120)),
                Err(e) => break Err(e),
            }
        };
        // 子进程已终止，stderr 管道会很快 EOF；限时等待兜底而非固定 sleep
        let err_text = err_rx.recv_timeout(Duration::from_secs(2)).unwrap_or_default();
        let final_path = final_rx.try_recv().unwrap_or_default();

        if cancel_wait.load(Ordering::Relaxed) {
            let _ = emit_event(&emit_w, &id_w, TaskEvent::Failed { message: "已取消".into() });
        } else {
            match status {
                Ok(s) if s.success() && !final_path.is_empty() => {
                    let _ = emit_event(&emit_w, &id_w, TaskEvent::Done { path: final_path });
                }
                Ok(s) if s.success() => {
                    // exit 0 但没有 after_move 路径 = match-filter 把条目全滤掉了（TD-DL-003），
                    // 原实现把它当成功，前端显示「完成」但磁盘上什么都没有。
                    let _ = emit_event(
                        &emit_w,
                        &id_w,
                        TaskEvent::Failed {
                            message: "没有可下载的视频流（内容可能为纯图文）".into(),
                        },
                    );
                }
                _ => {
                    let msg = crate::probe::explain_error(&err_text);
                    let _ = emit_event(&emit_w, &id_w, TaskEvent::Failed { message: msg });
                }
            }
        }
        on_finish();
    });

    Ok(handle)
}

fn emit_event(app: &AppHandle, id: &str, event: TaskEvent) -> Result<(), tauri::Error> {
    app.emit("task://event", TaskEventWrapper { id: id.to_string(), event })
}

#[derive(Clone, serde::Serialize)]
struct TaskEventWrapper {
    id: String,
    #[serde(flatten)]
    event: TaskEvent,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 契约测试（TD-DL-001）：前端 invoke 发送的 JSON 形状必须能反序列化。
    /// 形状以 src/lib/types.ts 的 DownloadOptions 为准。
    #[test]
    fn download_options_accepts_frontend_payload() {
        const PAYLOAD: &str = r#"{
            "url": "https://example.com/v",
            "targetDir": "/tmp/dl",
            "formatId": null,
            "useCookies": false,
            "browser": "chrome",
            "settings": { "ytdlpPath": null, "ffmpegPath": null }
        }"#;
        let o: DownloadOptions =
            serde_json::from_str(PAYLOAD).expect("camelCase payload 必须可反序列化");
        assert_eq!(o.target_dir, "/tmp/dl");
        assert_eq!(o.browser.as_deref(), Some("chrome"));
    }
}
