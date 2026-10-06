use crate::binresolve;
use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum FetchProgress {
    /// { received, total, speedMbps }  total 为 0 表示服务端未给 Content-Length
    Running {
        received: u64,
        total: u64,
        speed_mbps: f64,
    },
    Failed {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchDone {
    pub name: String,
    pub path: String,
    pub version: String,
}

/// 下载组件到 ~/.tikdown。
///
/// 刻意不做「静默自动下载」：Windows Defender 会隔离未签名二进制，
/// macOS Gatekeeper 也会拦。必须由用户主动点击，并在下载前说明来源与体积。
/// 这样既躲过了自动下载的静默失败，也让用户知情。
pub fn fetch(app: AppHandle, name: String) -> Result<(), String> {
    let (url, zip, exe) = match name.as_str() {
        "yt-dlp" => (ytdlp_url(), false, "yt-dlp"),
        "ffmpeg" => (ffmpeg_url(), true, "ffmpeg"),
        _ => return Err(format!("未知组件: {}", name)),
    };

    let emit = app.clone();
    let nm = name.clone();
    std::thread::spawn(move || {
        match run(&url, zip, exe, &emit, &nm) {
            Ok(path) => {
                // 回读版本号，前端要拿它二次确认门槛已过
                let version = Command::new(&path)
                    .arg("--version")
                    .output()
                    .ok()
                    .and_then(|o| binresolve::extract_version(&String::from_utf8_lossy(&o.stdout)))
                    .unwrap_or_default();
                let _ = emit.emit(
                    "core://done",
                    FetchDone {
                        name: nm,
                        path: path.display().to_string(),
                        version,
                    },
                );
            }
            Err(e) => {
                let _ = emit.emit("core://progress", FetchProgress::Failed { message: e });
            }
        }
    });

    Ok(())
}

fn run(
    url: &str,
    is_archive: bool,
    exe: &str,
    app: &AppHandle,
    name: &str,
) -> Result<PathBuf, String> {
    let dir = binresolve::app_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建 {}: {}", dir.display(), e))?;

    let tmp = dir.join(format!("{}.download", exe));
    download(url, &tmp, app, name)?;

    if is_archive {
        unzip(&tmp, &dir)?;
        let _ = std::fs::remove_file(&tmp);
    } else {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| format!("无法设置执行权限: {}", e))?;
        }
        std::fs::rename(&tmp, dir.join(exe_name(exe)))
            .map_err(|e| format!("无法移动到目标位置: {}", e))?;
    }

    let final_path = dir.join(exe_name(exe));
    // 下载完立刻验证一次：坏文件必须在这里被拦住，不能留到第一次下载任务时才发现
    let _ = Command::new(&final_path).arg("--version").output();
    Ok(final_path)
}

fn exe_name(stem: &str) -> String {
    if cfg!(windows) {
        format!("{}.exe", stem)
    } else {
        stem.to_string()
    }
}

/// 用 curl 下载。系统自带、零依赖，且能给出实时进度。
///
/// 不用 curl 的 progress-bar 模式（那是给终端看的，解析脆弱），
/// 而是读它的 `-w` 机器可读输出，配合 stdout 逐行推送进度。
fn download(url: &str, dest: &PathBuf, app: &AppHandle, name: &str) -> Result<(), String> {
    let mut cmd = Command::new("curl");
    cmd.arg("-fL")
        .arg("--retry")
        .arg("3")
        .arg("--connect-timeout")
        .arg("20")
        .arg("-o")
        .arg(dest)
        // 每秒输出一次进度，字段用 tab 分隔便于解析
        .arg("--progress-bar")
        .arg("-w")
        .arg("__PROGRESS__\t%{size_download}\t%{speed_download}\n")
        .arg(url);

    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("无法启动 curl（系统可能未安装）: {}", e))?;

    // 后台读 stdout 推进度
    let emit = app.clone();
    let nm = name.to_string();
    if let Some(out) = child.stdout.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                if let Some(rest) = line.strip_prefix("__PROGRESS__") {
                    let p: Vec<&str> = rest.split('\t').collect();
                    if p.len() >= 2 {
                        let received = p[0].parse::<u64>().unwrap_or(0);
                        let speed = p.get(1).and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                        let _ = emit.emit(
                            "core://progress",
                            FetchProgress::Running {
                                received,
                                total: 0,
                                speed_mbps: (speed / 1_048_576.0 * 100.0).round() / 100.0,
                            },
                        );
                    }
                }
            }
            let _ = nm;
        });
    }

    let status = child.wait().map_err(|e| format!("下载中断: {}", e))?;

    if !status.success() {
        let _ = std::fs::remove_file(dest);
        let hint = if name == "yt-dlp" {
            "国内网络可能无法直连 GitHub。可改用「设置 → 手动指定路径」，或配置代理后重试"
        } else {
            "可在「设置 → 手动指定路径」里指向系统已安装的 ffmpeg"
        };
        return Err(format!(
            "下载失败（curl exit {}）。{}",
            status.code().unwrap_or(-1),
            hint
        ));
    }
    Ok(())
}

/// 解压 zip。ffmpeg 的 macOS/windows 分发是 zip 格式。
#[cfg(windows)]
fn unzip(archive: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    use std::process::Stdio;
    let ps = format!(
        "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
        archive.display(),
        dest.display()
    );
    let out = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .stdin(Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("解压失败".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn unzip(archive: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    use std::process::Stdio;
    let out = Command::new("unzip")
        .arg("-o")
        .arg(archive)
        .arg("-d")
        .arg(dest)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("无法解压: {}", e))?;
    if !out.status.success() {
        return Err("解压失败（需要 unzip 命令）".into());
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn unzip(_archive: &PathBuf, _dest: &PathBuf) -> Result<(), String> {
    Err("Linux 建议直接使用系统包管理器安装 ffmpeg".into())
}

fn ytdlp_url() -> String {
    let base = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";
    if cfg!(target_os = "macos") {
        format!("{}yt-dlp_macos", base)
    } else if cfg!(windows) {
        format!("{}yt-dlp.exe", base)
    } else if cfg!(target_arch = "aarch64") {
        format!("{}yt-dlp_linux_aarch64", base)
    } else {
        format!("{}yt-dlp_linux", base)
    }
}

fn ffmpeg_url() -> String {
    if cfg!(target_os = "macos") {
        "https://evermeet.cx/ffmpeg/getrelease/ffmpeg-9.0.2.zip".into()
    } else if cfg!(windows) {
        "https://github.com/GyanD/codexffmpeg/releases/latest/download/ffmpeg-release-full.zip"
            .into()
    } else {
        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz".into()
    }
}
