use crate::binresolve;
use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

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

#[derive(Debug, Clone, Deserialize)]
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
    cancel: Arc<AtomicBool>,
}

impl DownloadHandle {
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }
}

/// 执行下载。全程异步，事件通过 Tauri 事件总线推给前端。
pub fn start(app: AppHandle, id: String, opts: DownloadOptions) -> Result<DownloadHandle, String> {
    let ytdlp = binresolve::ytdlp_path(opts.settings.ytdlp_path.as_deref())?;

    let mut cmd = Command::new(&ytdlp);

    // ---- 核心：只下视频 ----
    // vcodec=none 的条目（纯图文帖）在这里被过滤掉，
    // 不需要我们自己判断文件类型。
    cmd.arg("--match-filter").arg("vcodec!=none");
    cmd.arg("--no-write-thumbnail"); // 不额外下封面
    cmd.arg("--no-write-info-json"); // 不落 .info.json

    // 画质：不指定就用 bestvideo+bestaudio 兜底
    match &opts.format_id {
        Some(f) => {
            cmd.arg("-f").arg(format!("{}+b/best", f));
        }
        None => {
            cmd.arg("-f").arg("bv*+ba/b");
        }
    }

    // 合并为单一 mp4
    cmd.arg("--merge-output-format").arg("mp4");
    // ffmpeg 必须显式指定：brew 版 yt-dlp 常常找不到系统 ffmpeg，
    // 会静默不合并（退出码仍为 0）并打印一个不存在的合并路径。
    match binresolve::ffmpeg_path(opts.settings.ffmpeg_path.as_deref()) {
        Some(ff) => {
            cmd.arg("--ffmpeg-location").arg(&ff);
        }
        None => {
            // 没有 ffmpeg 时仍可下载不分片的平台，但 DASH 会拿到分离文件。
            // 不阻断——让用户先跑起来，状态栏会显示 ffmpeg 缺失。
        }
    }

    // 进度逐行输出，格式稳定，优于解析人类可读的 [download] 50%...
    cmd.arg("--newline");
    cmd.arg("--no-progress");
    // 让 yt-dlp 自己吐结构化 JSON 进度，而不是我们用正则去猜人类可读文本。
    // after_move 给出合并后文件的最终路径。
    cmd.arg("--progress");
    cmd.arg("--progress-template");
    cmd.arg(
        "download:%(progress.status)s\t%(progress.downloaded_bytes)s\t%(progress.total_bytes)s\t\
         %(progress.total_bytes_estimate)s\t%(progress.speed)s\t%(progress.eta)s\t%(progress.filename)s",
    );
    cmd.arg("--print").arg("after_move:__FINAL__%(filepath)s");

    cmd.arg("--no-playlist");
    cmd.arg("--ignore-errors");
    cmd.arg("--retries").arg("3");
    cmd.arg("--concurrent-fragments").arg("4");

    if opts.use_cookies {
        let browser = opts.browser.as_deref().unwrap_or("chrome");
        cmd.arg("--cookies-from-browser").arg(browser);
    }

    // 文件名模板：作者 - 标题.80B，非法字符由 yt-dlp 处理
    let out_tmpl = format!("{}/%(uploader)s - %(title).80B.%(ext)s", opts.target_dir);
    cmd.arg("-o").arg(&out_tmpl);
    cmd.arg(&opts.url);

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Unix 下隐藏终端窗口（Windows 用 CREATE_NO_WINDOW）
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn().map_err(|e| format!("无法启动 yt-dlp：{}", e))?;

    let stdout = child.stdout.take().ok_or("无法读取 yt-dlp 输出")?;
    let stderr = child.stderr.take().ok_or("无法读取 yt-dlp 错误输出")?;

    let cancel = Arc::new(AtomicBool::new(false));
    let handle = DownloadHandle {
        cancel: cancel.clone(),
    };

    let emit = app.clone();
    let ev_id = id.clone();

    // 开跑先报一声，前端立即把任务置为「下载中」而不是停在「待下载」
    let _ = emit.emit(
        "task://event",
        TaskEventWrapper {
            id: ev_id.clone(),
            event: TaskEvent::Starting,
        },
    );

    // 两个线程各持一份 cancel 的 Arc：进度线程用来提前退出，
    // 等待线程用来判断是否被用户取消。
    let cancel_progress = cancel.clone();

    // 进度线程
    let final_path: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let fp = final_path.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if cancel_progress.load(Ordering::Relaxed) {
                break;
            }
            // --print after_move 给出的最终落盘路径
            if let Some(rest) = line.strip_prefix("__FINAL__") {
                *fp.lock().unwrap() = rest.trim().to_string();
                continue;
            }
            if let Some(evt) = parse_progress(&line) {
                let _ = emit.emit(
                    "task://event",
                    TaskEventWrapper {
                        id: ev_id.clone(),
                        event: evt,
                    },
                );
            }
        }
    });

    // stderr 由这个线程独占读取：既监听合并阶段（UI 需要在 100% 时切到
    // 「合并中」，否则看起来像卡死），又把错误行攒进共享缓冲供结束后取用。
    let err_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let emit_err = app.clone();
    let ev_id_err = id.clone();
    let cancel_err = cancel.clone();
    let eb = err_buf.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if cancel_err.load(Ordering::Relaxed) {
                break;
            }
            if line.contains("[Merger]") || line.contains("Merging formats") {
                let _ = emit_err.emit(
                    "task://event",
                    TaskEventWrapper {
                        id: ev_id_err.clone(),
                        event: TaskEvent::Merging,
                    },
                );
            }
            eb.lock().unwrap().push_str(&line);
            eb.lock().unwrap().push('\n');
        }
    });

    // 等待子进程结束
    let app2 = app.clone();
    let id2 = id.clone();
    let cancel2 = cancel.clone();
    let eb2 = err_buf.clone();
    std::thread::spawn(move || {
        let status = child.wait();
        // 给 stderr 线程一点时间把最后几行读进来
        std::thread::sleep(std::time::Duration::from_millis(120));
        let err_text = eb2.lock().unwrap().clone();

        if cancel2.load(Ordering::Relaxed) {
            let _ = app2.emit(
                "task://event",
                TaskEventWrapper {
                    id: id2,
                    event: TaskEvent::Failed {
                        message: "已取消".into(),
                    },
                },
            );
            return;
        }

        match status {
            Ok(s) if s.success() => {
                let path = final_path.lock().unwrap().clone();
                let _ = app2.emit(
                    "task://event",
                    TaskEventWrapper {
                        id: id2,
                        event: TaskEvent::Done { path },
                    },
                );
            }
            _ => {
                let msg = crate::probe::explain_error(&err_text);
                let _ = app2.emit(
                    "task://event",
                    TaskEventWrapper {
                        id: id2,
                        event: TaskEvent::Failed { message: msg },
                    },
                );
            }
        }
    });

    Ok(handle)
}

#[derive(Clone, Serialize)]
struct TaskEventWrapper {
    id: String,
    #[serde(flatten)]
    event: TaskEvent,
}

/// 解析 `--progress-template` 输出的 tab 分隔进度行。
///
/// 格式：download:<status>\t<downloaded>\t<total>\t<estimate>\t<speed>\t<eta>\t<filename>
/// 让 yt-dlp 自己格式化，我们只按 tab 切分 —— 这样上游改文案不会影响解析。
fn parse_progress(line: &str) -> Option<TaskEvent> {
    let rest = line.strip_prefix("download:")?;
    if rest.starts_with("finished") {
        return None;
    }
    let f: Vec<&str> = rest.split('\t').collect();
    if f.len() < 7 {
        return None;
    }

    let num = |s: &str| s.parse::<u64>().unwrap_or(0);
    let downloaded = num(f[1]);
    // total 缺失时退到估算值，两者都没有才算真的不知道总量
    let total = {
        let t = num(f[2]);
        if t > 0 {
            t
        } else {
            num(f[3])
        }
    };

    let speed_bps: f64 = f[4].parse().unwrap_or(0.0);
    let speed = if speed_bps > 0.0 {
        format!("{:.1} MB/s", speed_bps / 1_048_576.0)
    } else {
        String::new()
    };

    let eta = f[5]
        .parse::<u64>()
        .ok()
        .map(|s| {
            let m = s / 60;
            if m > 0 {
                format!("{}分{}秒", m, s % 60)
            } else {
                format!("{}秒", s)
            }
        })
        .unwrap_or_default();

    let filename = f[6].rsplit('/').next().unwrap_or("").to_string();
    let percent = if total > 0 {
        downloaded as f64 / total as f64 * 100.0
    } else {
        0.0
    };

    Some(TaskEvent::Progress {
        percent,
        downloaded,
        total,
        speed,
        eta,
        filename,
    })
}
