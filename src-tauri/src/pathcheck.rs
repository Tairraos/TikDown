//! 系统 PATH 目录解析与设置弹层的路径检测。
//!
//! GUI 应用继承的进程 PATH 很窄（macOS 上常只有 /usr/bin:/bin:/usr/sbin:/sbin），
//! 用户在 .zshrc 里配置的目录（如 /opt/homebrew/bin）不在其中——这里负责补齐。
use serde::Serialize;
use std::path::Path;

use crate::binresolve::{probe_version, version_ge, ComponentSpec, FFMPEG, YTDLP};

/// 检测结果：设置弹层里手贴路径的校验输出（存在 + 版本合适才通过）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub ok: bool,
    pub version: Option<String>,
    pub message: String,
}

/// 设置弹层的路径检测（TD-FE-010）：`name` ∈ yt-dlp / ffmpeg / download-dir。
/// 组件路径必须存在、可执行、版本不低于门槛；目录必须存在。
pub fn check_candidate(name: &str, path: &Path) -> CheckResult {
    match name {
        "yt-dlp" | "ffmpeg" => {
            let spec: &ComponentSpec = if name == "yt-dlp" { &YTDLP } else { &FFMPEG };
            if !path.is_file() {
                return CheckResult {
                    ok: false,
                    version: None,
                    message: "路径不存在或不是文件".into(),
                };
            }
            match probe_version(path, spec.version_flag) {
                Some(v) if version_ge(&v, spec.min_version) => CheckResult {
                    ok: true,
                    version: Some(v.clone()),
                    message: format!("版本 {} 合格", v),
                },
                Some(v) => CheckResult {
                    ok: false,
                    version: Some(v.clone()),
                    message: format!("版本 {} 低于最低要求 {}", v, spec.min_version),
                },
                None => CheckResult {
                    ok: false,
                    version: None,
                    message: "无法执行该文件（不可执行、已损坏，或与本机架构不符）".into(),
                },
            }
        }
        "download-dir" => {
            if path.is_dir() {
                CheckResult {
                    ok: true,
                    version: None,
                    message: "目录可用".into(),
                }
            } else {
                CheckResult {
                    ok: false,
                    version: None,
                    message: "目录不存在".into(),
                }
            }
        }
        _ => CheckResult {
            ok: false,
            version: None,
            message: format!("未知检测对象: {name}"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_candidate_passes_working_binary_and_rejects_bad_ones() {
        let tmp = std::env::temp_dir().join(format!("tikdown-check-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        use std::os::unix::fs::PermissionsExt;

        let good = tmp.join("yt-dlp");
        std::fs::write(&good, "#!/bin/sh\necho \"2026.08.19\"\n").unwrap();
        std::fs::set_permissions(&good, std::fs::Permissions::from_mode(0o755)).unwrap();

        let outdated = tmp.join("yt-dlp-old");
        std::fs::write(&outdated, "#!/bin/sh\necho \"2024.01.01\"\n").unwrap();
        std::fs::set_permissions(&outdated, std::fs::Permissions::from_mode(0o755)).unwrap();

        let broken = tmp.join("yt-dlp-broken");
        std::fs::write(&broken, "#!/bin/sh\nexit 3\n").unwrap();
        std::fs::set_permissions(&broken, std::fs::Permissions::from_mode(0o755)).unwrap();

        let r = check_candidate("yt-dlp", &good);
        assert!(r.ok, "{r:?}");
        assert_eq!(r.version.as_deref(), Some("2026.08.19"));

        let r = check_candidate("yt-dlp", &outdated);
        assert!(!r.ok);
        assert!(r.message.contains("2024.01.01"), "{r:?}");

        let r = check_candidate("yt-dlp", &broken);
        assert!(!r.ok);
        assert!(r.message.contains("无法执行"), "{r:?}");

        let r = check_candidate("yt-dlp", &tmp.join("missing"));
        assert!(!r.ok && r.message.contains("不存在"));

        let r = check_candidate("download-dir", &tmp);
        assert!(r.ok);
        let r = check_candidate("download-dir", &tmp.join("missing-dir"));
        assert!(!r.ok);

        std::fs::remove_dir_all(&tmp).ok();
    }
}
