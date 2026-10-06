use crate::binresolve;
use crate::binresolve::exe_name;
use serde::Serialize;
use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum FetchProgress {
    /// { name, received, total, speedMbps } total 为 0 表示服务端未给 Content-Length
    Running {
        name: String,
        received: u64,
        total: u64,
        speed_mbps: f64,
    },
    Failed {
        name: String,
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

/// 正在下载的组件集合：重入防护（TD-CORE-006），同一组件不允许并发下载。
#[derive(Default)]
pub struct Fetching(pub Arc<Mutex<HashSet<String>>>);

/// 下载组件到 ~/.tikdown。
///
/// 刻意不做「静默自动下载」：Windows Defender 会隔离未签名二进制，
/// macOS Gatekeeper 也会拦。必须由用户主动点击，并在下载前说明来源与体积。
/// 这样既躲过了自动下载的静默失败，也让用户知情。
pub fn fetch(app: AppHandle, fetching: State<'_, Fetching>, name: String) -> Result<(), String> {
    let spec: &'static binresolve::ComponentSpec = match name.as_str() {
        "yt-dlp" => &binresolve::YTDLP,
        "ffmpeg" => &binresolve::FFMPEG,
        _ => return Err(format!("未知组件: {}", name)),
    };
    let url = download_url(&name);
    let is_archive = name == "ffmpeg";

    // 重入防护：同一组件进行中时拒绝再次下载，避免两个下载流写同一临时文件
    if !fetching.0.lock().unwrap().insert(name.clone()) {
        return Err(format!("{name} 正在下载中，请等待完成"));
    }

    let set = fetching.0.clone();
    std::thread::spawn(move || {
        let result = run(&url, is_archive, spec, &app, &name);
        set.lock().unwrap().remove(&name);
        match result {
            Ok((path, version)) => {
                let _ = app.emit(
                    "core://done",
                    FetchDone {
                        name,
                        path: path.display().to_string(),
                        version,
                    },
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "core://progress",
                    FetchProgress::Failed { name, message: e },
                );
            }
        }
    });

    Ok(())
}

fn run(
    url: &str,
    is_archive: bool,
    spec: &'static binresolve::ComponentSpec,
    app: &AppHandle,
    name: &str,
) -> Result<(PathBuf, String), String> {
    let dir = binresolve::app_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建 {}: {}", dir.display(), e))?;

    let tmp = dir.join(format!("{}.download", exe_name(spec.name)));
    download(url, &tmp, name, app)?;

    if is_archive {
        extract(&tmp, &dir)?;
        let _ = std::fs::remove_file(&tmp);
        // 压缩包内的可执行文件可能嵌在子目录（如 ffmpeg-N.M_build/bin/），搬到目录根
        relocate_to_dir_root(&dir, exe_name(spec.name))?;
    } else {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| format!("无法设置执行权限: {}", e))?;
        }
        std::fs::rename(&tmp, dir.join(exe_name(spec.name)))
            .map_err(|e| format!("无法移动到目标位置: {}", e))?;
    }

    let final_path = dir.join(exe_name(spec.name));
    // 下载完立刻验证：坏文件必须在这里被拦住，不能留到第一次下载任务时才发现（TD-CORE-004）
    match verify(spec, &final_path) {
        Ok(version) => Ok((final_path, version)),
        Err(e) => {
            let _ = std::fs::remove_file(&final_path);
            Err(e)
        }
    }
}

/// 下载后强制校验：能执行、能读出版本号、版本不低于门槛（TD-CORE-004）。
/// 返回版本号供 Done 事件使用，避免二次执行 --version。
fn verify(spec: &binresolve::ComponentSpec, exe_path: &Path) -> Result<String, String> {
    let out = Command::new(exe_path)
        .arg(spec.version_flag)
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|e| format!("无法执行下载的组件: {}", e))?;
    if !out.status.success() {
        return Err("下载的组件无法执行（文件损坏或与本机架构不符）".into());
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let ver = binresolve::extract_version(&text).ok_or("无法从组件输出中读取版本号")?;
    if !binresolve::version_ge(&ver, spec.min_version) {
        return Err(format!(
            "{} 版本 {} 低于最低要求 {}",
            spec.name, ver, spec.min_version
        ));
    }
    Ok(ver)
}

/// 在 dir 目录树里找到名为 exe 的可执行文件，移动到 dir 根目录（TD-CORE-003）。
fn relocate_to_dir_root(dir: &Path, exe: String) -> Result<(), String> {
    let found = find_file(dir, &exe)
        .ok_or_else(|| format!("解压后未找到 {exe}（分发目录结构与预期不符）"))?;
    let target = dir.join(&exe);
    if found != target {
        std::fs::rename(&found, &target)
            .map_err(|e| format!("无法移动 {}: {}", found.display(), e))?;
    }
    Ok(())
}

fn find_file(dir: &Path, name: &str) -> Option<PathBuf> {
    for e in std::fs::read_dir(dir).ok()?.flatten() {
        let p = e.path();
        if p.is_dir() {
            if let Some(f) = find_file(&p, name) {
                return Some(f);
            }
        } else if p.file_name()?.to_str()? == name {
            return Some(p);
        }
    }
    None
}

/// 用 ureq 流式下载：Content-Length 给总量，每 250ms 推一次进度事件（TD-CORE-005）。
///
/// 不再用 curl 子进程：curl 的 `-w` 只在传输结束后输出一次，进度机制实际失效，
/// 且给应用引入了一个不可控的系统依赖。
fn download(url: &str, dest: &Path, name: &str, app: &AppHandle) -> Result<(), String> {
    // 连接超时 20s;不设整体超时——大文件下载不能被总时长掐断
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(20))
        .build();
    let resp = agent.get(url).call().map_err(|e| {
        let hint = download_failure_hint(name);
        match e {
            ureq::Error::Status(code, _) => format!("下载失败（HTTP {code}）。{hint}"),
            ureq::Error::Transport(t) => format!("网络错误：{t}。{hint}"),
        }
    })?;

    let total: u64 = resp
        .header("Content-Length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let mut reader = resp.into_reader();
    let mut file = std::fs::File::create(dest).map_err(|e| format!("无法创建文件: {e}"))?;
    let mut buf = [0u8; 64 * 1024];
    let mut received: u64 = 0;
    let mut last = Instant::now();
    let mut last_bytes: u64 = 0;

    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("下载中断：{e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("写入失败: {e}"))?;
        received += n as u64;

        let elapsed = last.elapsed();
        if elapsed >= Duration::from_millis(250) {
            let speed = (received - last_bytes) as f64 / elapsed.as_secs_f64();
            let _ = app.emit(
                "core://progress",
                FetchProgress::Running {
                    name: name.to_string(),
                    received,
                    total,
                    speed_mbps: (speed / 1_048_576.0 * 100.0).round() / 100.0,
                },
            );
            last = Instant::now();
            last_bytes = received;
        }
    }
    Ok(())
}

fn download_failure_hint(name: &str) -> &'static str {
    if name == "yt-dlp" {
        "国内网络可能无法直连 GitHub。可改用「设置 → 手动指定路径」，或配置代理后重试"
    } else {
        "可在「设置 → 手动指定路径」里指向系统已安装的 ffmpeg"
    }
}

/// 解压 ffmpeg 分发包。zip（macOS/Windows）与 tar.xz（Linux）。
#[cfg(windows)]
fn extract(archive: &Path, dest: &Path) -> Result<(), String> {
    use std::process::Stdio;
    // PowerShell 单引号字符串里的单引号用两个单引号转义（TD-SEC-003）
    let q = |p: &Path| p.display().to_string().replace('\'', "''");
    let ps = format!(
        "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
        q(archive),
        q(dest)
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
fn extract(archive: &Path, dest: &Path) -> Result<(), String> {
    use std::process::Stdio;
    let out = Command::new("unzip")
        .arg("-o")
        .arg(archive)
        .arg("-d")
        .arg(dest)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("无法解压: {e}"))?;
    if !out.status.success() {
        return Err("解压失败（需要 unzip 命令）".into());
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn extract(archive: &Path, dest: &Path) -> Result<(), String> {
    use std::process::Stdio;
    let out = Command::new("tar")
        .arg("-xf")
        .arg(archive)
        .arg("-C")
        .arg(dest)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("无法解压: {e}"))?;
    if !out.status.success() {
        return Err("解压失败（需要 tar 命令）".into());
    }
    Ok(())
}

fn download_url(name: &str) -> String {
    match name {
        "yt-dlp" => {
            let base = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";
            if cfg!(target_os = "macos") {
                format!("{base}yt-dlp_macos")
            } else if cfg!(windows) {
                format!("{base}yt-dlp.exe")
            } else if cfg!(target_arch = "aarch64") {
                format!("{base}yt-dlp_linux_aarch64")
            } else {
                format!("{base}yt-dlp_linux")
            }
        }
        // evermeet.cx /getrelease/zip 恒指最新版,避免硬编码版本号腐烂
        "ffmpeg" if cfg!(target_os = "macos") => "https://evermeet.cx/ffmpeg/getrelease/zip".into(),
        "ffmpeg" if cfg!(windows) => {
            "https://github.com/GyanD/codexffmpeg/releases/latest/download/ffmpeg-release-full.zip"
                .into()
        }
        "ffmpeg" if cfg!(target_arch = "aarch64") => {
            "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz".into()
        }
        _ => "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz".into(),
    }
}
