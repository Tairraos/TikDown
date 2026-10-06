use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

/// 组件的最低可用版本。
///
/// 定这个门槛的依据：低于此版本时小红书、Pinterest 等提取器基本不可用，
/// 而这些正是本项目的核心目标平台。宁可在版本检查时明确拒绝，
///也不要让用户拿一个装了却下不了东西的版本。
pub const YTDLP_MIN: &str = "2025.01.01";
/// ffmpeg 5.0 之前无法处理部分 DASH 流，会导致音视频不分离或合并失败。
pub const FFMPEG_MIN: &str = "5.0";

/// 组件在当前机器上的可用状态。前端据此渲染引导条。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum ComponentState {
    /// 就绪，且是用应用自己下载的副本
    Ready {
        path: String,
        version: String,
        source: Source,
    },
    /// 就绪，但用的是用户自己的，且版本比内置要求高
    ReadyExternal { path: String, version: String },
    /// 找到了但版本太旧，需要升级
    Outdated {
        path: String,
        version: String,
        required: String,
    },
    /// 没找到，需要用户点击下载
    Missing,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    /// 应用下载到 ~/.tikdown 的副本
    Managed,
    /// 用户在设置里手动指定的
    Configured,
    /// 从系统 PATH 找到的
    SystemPath,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentStatus {
    pub name: String,
    pub state: ComponentState,
    /// 预计下载体积（字节），仅 Missing 时有值
    pub download_size: Option<u64>,
    /// 安装位置提示
    pub hint: Option<String>,
}

/// 应用数据目录：~/.tikdown
///
/// 刻意不用系统标准的 Application Support —— 这个目录里的东西是用户
/// 可随时删除重建的（删了应用会自动重新下载），用简单的点开头目录
/// 更符合直觉，也方便用户自己手动排查。
pub fn app_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".tikdown")
}

/// 检测 ffmpeg。缺失时不算致命错误——只要不下载 DASH 分片就能跑，
/// 因此这里不返回 Err，由调用方决定是否降级。
pub fn detect_ffmpeg(configured: Option<&str>) -> ComponentStatus {
    let candidates = ordered_candidates("ffmpeg", configured);
    let mut found_but_old = None;

    for (path, source) in candidates {
        let Some(ver) = probe_version(&path, "-version") else {
            continue;
        };
        if version_ge(&ver, FFMPEG_MIN) {
            return ok_status("ffmpeg", &path, &ver, source);
        }
        found_but_old = Some((path, ver));
    }

    match found_but_old {
        Some((path, ver)) => ComponentStatus {
            name: "ffmpeg".into(),
            state: ComponentState::Outdated {
                path: path.display().to_string(),
                version: ver,
                required: FFMPEG_MIN.into(),
            },
            download_size: Some(ffmpeg_download_size()),
            hint: Some("ffmpeg 用于合并音视频分片，版本过旧会导致下载失败".into()),
        },
        None => ComponentStatus {
            name: "ffmpeg".into(),
            state: ComponentState::Missing,
            download_size: Some(ffmpeg_download_size()),
            hint: Some("ffmpeg 用于合并音视频分片。可在设置里指定系统已有版本".into()),
        },
    }
}

/// 检测 yt-dlp。这是必需组件，缺失即无法工作。
pub fn detect_ytdlp(configured: Option<&str>) -> ComponentStatus {
    let candidates = ordered_candidates("yt-dlp", configured);
    let mut found_but_old = None;

    for (path, source) in candidates {
        let Some(ver) = probe_version(&path, "--version") else {
            continue;
        };
        if version_ge(&ver, YTDLP_MIN) {
            return ok_status("yt-dlp", &path, &ver, source);
        }
        found_but_old = Some((path, ver));
    }

    match found_but_old {
        Some((path, ver)) => ComponentStatus {
            name: "yt-dlp".into(),
            state: ComponentState::Outdated {
                path: path.display().to_string(),
                version: ver,
                required: YTDLP_MIN.into(),
            },
            download_size: Some(YTDLP_DOWNLOAD_SIZE),
            hint: Some("yt-dlp 负责解析平台接口，版本过旧会导致解析失败".into()),
        },
        None => ComponentStatus {
            name: "yt-dlp".into(),
            state: ComponentState::Missing,
            download_size: Some(YTDLP_DOWNLOAD_SIZE),
            hint: Some("粘贴链接即可下载，无需注册账号".into()),
        },
    }
}

/// 探测顺序：**设置里的指定 > 应用管理的副本 > 系统 PATH**。
///
/// 用户显式指定的优先级最高——这是他的明确意志，应用不该覆盖。
/// 反过来「有就用」也不行：一个 2024 年的系统 yt-dlp 会让整个应用
/// 静默失效，所以每级都要过版本门槛。
fn ordered_candidates(stem: &str, configured: Option<&str>) -> Vec<(PathBuf, Source)> {
    let mut out: Vec<(PathBuf, Source)> = Vec::new();
    let exe = exe_name(stem);

    if let Some(p) = configured {
        out.push((PathBuf::from(p), Source::Configured));
    }
    out.push((app_dir().join(&exe), Source::Managed));
    if let Ok(p) = which::which(&exe) {
        out.push((p, Source::SystemPath));
    }
    out
}

fn ok_status(name: &str, path: &Path, version: &str, source: Source) -> ComponentStatus {
    let s = match source {
        Source::Managed => ComponentState::Ready {
            path: path.display().to_string(),
            version: version.into(),
            source,
        },
        _ => ComponentState::ReadyExternal {
            path: path.display().to_string(),
            version: version.into(),
        },
    };
    ComponentStatus {
        name: name.into(),
        state: s,
        download_size: None,
        hint: None,
    }
}

/// 读取版本号。
///
/// ffmpeg 的 `-version` 第一行是 `ffmpeg version 7.1.1 Copyright...`，
/// 而 `--version` 只对 yt-dlp 有意义，所以参数要分开传。
fn probe_version(path: &Path, flag: &str) -> Option<String> {
    let out = Command::new(path)
        .arg(flag)
        .stdin(std::process::Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    extract_version(&text)
}

/// 从输出文本里抽出版本号。
pub fn extract_version(text: &str) -> Option<String> {
    let first = text.lines().next()?;
    // `ffmpeg version 7.1.1 Copyright (c)...` 或纯 `2026.08.19`
    let token = if first.starts_with("ffmpeg version") {
        first.split_whitespace().nth(2)?
    } else {
        first.split_whitespace().next()?
    };
    // 只取开头的数字段：`2026.08.19` / `7.1.1`
    let v: String = token
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    let v = v.trim_end_matches('.').to_string();
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

/// 版本比较：a >= b。段数不等时按缺 0 处理（7.1 == 7.1.0）。
pub fn version_ge(a: &str, b: &str) -> bool {
    let pa: Vec<u32> = a.split('.').map(|s| s.parse().unwrap_or(0)).collect();
    let pb: Vec<u32> = b.split('.').map(|s| s.parse().unwrap_or(0)).collect();
    let n = pa.len().max(pb.len());
    for i in 0..n {
        let x = pa.get(i).copied().unwrap_or(0);
        let y = pb.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    true
}

fn exe_name(stem: &str) -> String {
    if cfg!(windows) {
        format!("{}.exe", stem)
    } else {
        stem.to_string()
    }
}

/// 各平台静态构建的压缩包体积（实测 2026-10-06），用于下载前告知用户。
pub const YTDLP_DOWNLOAD_SIZE: u64 = 35 * 1024 * 1024;

fn ffmpeg_download_size() -> u64 {
    if cfg!(windows) || cfg!(target_os = "macos") {
        25 * 1024 * 1024
    } else {
        40 * 1024 * 1024
    }
}

// ============ 以下为实际执行时用的路径解析 ============

/// 拿 yt-dlp 的可执行路径。必须在 detect_ytdlp 确认就绪之后调用。
pub fn ytdlp_path(configured: Option<&str>) -> Result<PathBuf, String> {
    for (path, _) in ordered_candidates("yt-dlp", configured) {
        if probe_version(&path, "--version").is_some() {
            return Ok(path);
        }
    }
    Err("yt-dlp 不可用".into())
}

/// 拿 ffmpeg 路径。返回 None 表示没有，调用方需要降级处理。
pub fn ffmpeg_path(configured: Option<&str>) -> Option<PathBuf> {
    ordered_candidates("ffmpeg", configured)
        .into_iter()
        .map(|(path, _)| path)
        .find(|path| path.exists())
}
