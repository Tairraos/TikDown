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

/// 组件描述：把两个组件的全部差异收敛到一处，detect/ytdlp_path 共用（TD-CORE-007）。
pub struct ComponentSpec {
    pub name: &'static str,
    pub min_version: &'static str,
    /// yt-dlp 用 `--version`，ffmpeg 只认 `-version`
    pub version_flag: &'static str,
    pub download_size: fn() -> u64,
    pub missing_hint: &'static str,
    pub outdated_hint: &'static str,
}

/// yt-dlp：必需组件，缺失即无法工作。
pub const YTDLP: ComponentSpec = ComponentSpec {
    name: "yt-dlp",
    min_version: YTDLP_MIN,
    version_flag: "--version",
    download_size: || YTDLP_DOWNLOAD_SIZE,
    missing_hint: "粘贴链接即可下载，无需注册账号",
    outdated_hint: "yt-dlp 负责解析平台接口，版本过旧会导致解析失败",
};

/// ffmpeg：缺失时不算致命错误——只要不下载 DASH 分片就能跑，
/// 因此 detect 不返回 Err，由调用方决定是否降级。
pub const FFMPEG: ComponentSpec = ComponentSpec {
    name: "ffmpeg",
    min_version: FFMPEG_MIN,
    version_flag: "-version",
    download_size: ffmpeg_download_size,
    missing_hint: "ffmpeg 用于合并音视频分片。可在设置里指定系统已有版本",
    outdated_hint: "ffmpeg 用于合并音视频分片，版本过旧会导致下载失败",
};

/// 按探测顺序检测组件：设置里的指定 > 应用管理的副本 > 系统 PATH，
/// 每一级都要过版本门槛。返回首个达标项；全部不达标时给出 Outdated 或 Missing。
pub fn detect(spec: &ComponentSpec, configured: Option<&str>) -> ComponentStatus {
    let mut found_but_old = None;

    for (path, source) in ordered_candidates(spec.name, configured) {
        let Some(ver) = probe_version(&path, spec.version_flag) else {
            continue;
        };
        if version_ge(&ver, spec.min_version) {
            return ok_status(spec.name, &path, &ver, source);
        }
        found_but_old = Some((path, ver));
    }

    match found_but_old {
        Some((path, ver)) => ComponentStatus {
            name: spec.name.into(),
            state: ComponentState::Outdated {
                path: path.display().to_string(),
                version: ver,
                required: spec.min_version.into(),
            },
            download_size: Some((spec.download_size)()),
            hint: Some(spec.outdated_hint.into()),
        },
        None => ComponentStatus {
            name: spec.name.into(),
            state: ComponentState::Missing,
            download_size: Some((spec.download_size)()),
            hint: Some(spec.missing_hint.into()),
        },
    }
}

/// 探测顺序：**设置里的指定 > 系统 PATH > 应用管理的副本**（TD-CORE-008，用户决策）。
///
/// 用户显式指定的优先级最高——这是他的明确意志，应用不该覆盖。
/// 系统 PATH 提前：用户机器上已有版本合格的组件直接引用，避免重复下载；
/// 但版本门槛每级不变——一个 2024 年的系统 yt-dlp 依然会被跳过，落到 ~/.tikdown 副本。
fn ordered_candidates(stem: &str, configured: Option<&str>) -> Vec<(PathBuf, Source)> {
    let mut out: Vec<(PathBuf, Source)> = Vec::new();
    let exe = exe_name(stem);

    if let Some(p) = configured {
        out.push((PathBuf::from(p), Source::Configured));
    }
    if let Ok(p) = which::which(&exe) {
        out.push((p, Source::SystemPath));
    }
    // macOS GUI 应用继承不到 shell 配置的 PATH（如 /opt/homebrew/bin），按用户
    // 环境补齐候选（TD-CORE-009）：进程 PATH 命中不了时，zsh 配置目录逐个尝试。
    for dir in system_path_dirs() {
        let cand = dir.join(&exe);
        if cand.exists() && !out.iter().any(|(p, _)| *p == cand) {
            out.push((cand, Source::SystemPath));
        }
    }
    out.push((app_dir().join(&exe), Source::Managed));
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
pub fn probe_version(path: &Path, flag: &str) -> Option<String> {
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

/// 可执行文件名（Windows 加 .exe 后缀）。fetch.rs 下载组件时复用。
pub(crate) fn exe_name(stem: &str) -> String {
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

/// 拿组件的可执行路径（按探测顺序，每个候选都验证可执行并读取版本）。
pub fn resolve_path(spec: &ComponentSpec, configured: Option<&str>) -> Result<PathBuf, String> {
    for (path, _) in ordered_candidates(spec.name, configured) {
        if probe_version(&path, spec.version_flag).is_some() {
            return Ok(path);
        }
    }
    Err(format!("{} 不可用", spec.name))
}

/// 拿 yt-dlp 的可执行路径。必须在 detect 确认就绪之后调用。
pub fn ytdlp_path(configured: Option<&str>) -> Result<PathBuf, String> {
    resolve_path(&YTDLP, configured)
}

/// 拿 ffmpeg 路径。返回 None 表示没有，调用方需要降级处理。
pub fn ffmpeg_path(configured: Option<&str>) -> Option<PathBuf> {
    ordered_candidates("ffmpeg", configured)
        .into_iter()
        .map(|(path, _)| path)
        .find(|path| path.exists())
}

/// GUI 应用继承的进程 PATH 很窄（macOS 上常只有 /usr/bin:/bin:/usr/sbin:/sbin），
/// 用户在 .zshrc 里配置的目录（如 /opt/homebrew/bin）不在其中。
/// 解析 zsh 配置提取 PATH 目录，外加 homebrew 标准位置兜底（TD-CORE-009）。
#[cfg(target_os = "macos")]
fn system_path_dirs() -> Vec<PathBuf> {
    let Ok(home) = std::env::var("HOME") else {
        return vec![];
    };
    if home.is_empty() {
        return vec![];
    }
    let mut dirs = shell_path_dirs(Path::new(&home));
    for std_dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
        let d = PathBuf::from(std_dir);
        if !dirs.contains(&d) {
            dirs.push(d);
        }
    }
    dirs
}

#[cfg(not(target_os = "macos"))]
fn system_path_dirs() -> Vec<PathBuf> {
    vec![]
}

/// 解析 ~/.zshrc 与 ~/.zprofile 里的 PATH 赋值行，提取目录列表。
/// 支持 `export PATH="a:b"` / `PATH=a:b`；展开 `~` 与 `$HOME` 前缀，
/// 跳过 `$PATH`/`${PATH}` 这类对旧值的引用段与注释行，按出现顺序去重。
#[cfg(target_os = "macos")]
fn shell_path_dirs(home: &Path) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    for file in [".zshrc", ".zprofile"] {
        let Ok(text) = std::fs::read_to_string(home.join(file)) else {
            continue;
        };
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with('#') {
                continue;
            }
            let body = line.strip_prefix("export ").unwrap_or(line);
            let Some(value) = body.strip_prefix("PATH=") else {
                continue;
            };
            let value = value.trim_matches('"').trim_matches('\'');
            for seg in value.split(':') {
                let seg = seg.trim();
                if seg.is_empty() || seg.starts_with("${") {
                    continue;
                }
                let expanded = if seg == "~" {
                    home.to_path_buf()
                } else if let Some(rest) = seg.strip_prefix("~/") {
                    home.join(rest)
                } else if let Some(rest) = seg.strip_prefix("$HOME/") {
                    home.join(rest)
                } else if seg.starts_with('$') {
                    // $PATH 等对旧值的引用：GUI 进程 PATH 里没有这些，跳过
                    continue;
                } else {
                    PathBuf::from(seg)
                };
                if !dirs.contains(&expanded) {
                    dirs.push(expanded);
                }
            }
        }
    }
    dirs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    #[test]
    fn shell_path_dirs_parses_zsh_configs() {
        let tmp = std::env::temp_dir().join(format!("tikdown-home-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(
                tmp.join(".zshrc"),
                "export PATH=\"/opt/tools/bin:$PATH\"\nexport PATH=$HOME/bin:$PATH\n# export PATH=/commented:/out\nPATH=/opt/late/bin:$PATH\n",
            )
            .unwrap();
        std::fs::write(
            tmp.join(".zprofile"),
            "PATH=${PATH}:/opt/late/bin:~/localbin\n",
        )
        .unwrap();

        let dirs = shell_path_dirs(&tmp);
        assert!(dirs.contains(&PathBuf::from("/opt/tools/bin")), "{dirs:?}");
        assert!(
            dirs.contains(&tmp.join("bin")),
            "$HOME/bin 应展开: {dirs:?}"
        );
        assert!(dirs.contains(&PathBuf::from("/opt/late/bin")));
        assert!(
            dirs.contains(&tmp.join("localbin")),
            "~/localbin 应展开: {dirs:?}"
        );
        assert!(
            !dirs.iter().any(|d| d == &PathBuf::from("/commented")),
            "注释行应跳过"
        );
        // 去重:zprofile 里的 /opt/late/bin 不应出现两次
        assert_eq!(
            dirs.iter()
                .filter(|d| *d == &PathBuf::from("/opt/late/bin"))
                .count(),
            1
        );
        std::fs::remove_dir_all(&tmp).ok();
    }
}
