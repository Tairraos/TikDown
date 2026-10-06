//! yt-dlp 命令行参数契约。纯函数，可单测锁定；改动前先想清楚对上游行为的依赖。
use super::DownloadOptions;
use crate::probe;
use std::path::Path;
use std::process::Command;

/// 进度行前缀：--progress-template 的 download: 输出（tab 分隔，机器可读，core-beliefs #18）
pub const PROGRESS_PREFIX: &str = "download:";
/// --print after_move 输出的最终落盘路径前缀
pub const FINAL_PREFIX: &str = "__FINAL__";
pub const PROGRESS_TEMPLATE: &str = "download:%(progress.status)s\t%(progress.downloaded_bytes)s\t%(progress.total_bytes)s\t%(progress.total_bytes_estimate)s\t%(progress.speed)s\t%(progress.eta)s\t%(progress.filename)s";

/// 组装 yt-dlp 参数（纯函数，可单测锁定参数契约，TD-DL-005）。
pub fn yt_dlp_args(opts: &DownloadOptions, ffmpeg: Option<&Path>) -> Vec<String> {
    // ---- 核心：只下视频 ----
    // vcodec=none 的条目（纯图文帖）在这里被过滤掉，不需要我们自己判断文件类型。
    let mut args: Vec<String> = vec![
        "--match-filter".into(),
        "vcodec!=none".into(),
        "--no-write-thumbnail".into(), // 不额外下封面
        "--no-write-info-json".into(), // 不落 .info.json
    ];

    // 画质：不指定就用 bestvideo+bestaudio 兜底
    match &opts.format_id {
        Some(f) => {
            args.push("-f".into());
            args.push(format!("{f}+b/best"));
        }
        None => {
            args.push("-f".into());
            args.push("bv*+ba/b".into());
        }
    }

    // 合并为单一 mp4
    args.push("--merge-output-format".into());
    args.push("mp4".into());
    // ffmpeg 必须显式指定：brew 版 yt-dlp 常常找不到系统 ffmpeg，
    // 会静默不合并（退出码仍为 0）并打印一个不存在的合并路径。
    if let Some(ff) = ffmpeg {
        args.push("--ffmpeg-location".into());
        args.push(ff.display().to_string());
    }

    // 进度逐行输出，格式稳定，优于解析人类可读的 [download] 50%...
    args.push("--newline".into());
    // 让 yt-dlp 自己吐结构化进度（--no-progress 与 --progress 同时传是矛盾参数，
    // 已移除死参数 TD-DL-006）
    args.push("--progress".into());
    args.push("--progress-template".into());
    args.push(PROGRESS_TEMPLATE.into());
    args.push("--print".into());
    args.push(format!("after_move:{FINAL_PREFIX}%(filepath)s"));

    args.push("--no-playlist".into());
    args.push("--ignore-errors".into());
    args.push("--retries".into());
    args.push("3".into());
    args.push("--concurrent-fragments".into());
    args.push("4".into());

    // Cookie 与探测共用同一份设置（TD-PROBE-001），不再有独立的 useCookies 开关
    let s = &opts.settings;
    for a in probe::cookie_args(
        s.cookie_mode.as_deref(),
        s.cookie_browser.as_deref(),
        s.cookie_file.as_deref(),
    ) {
        args.push(a);
    }

    // 文件名模板：作者 - 标题.80B，非法字符由 yt-dlp 处理
    args.push("-o".into());
    args.push(format!(
        "{}/%(uploader)s - %(title).80B.%(ext)s",
        opts.target_dir
    ));
    args.push(opts.url.clone());
    args
}

pub fn build_command(ytdlp: &Path, opts: &DownloadOptions, ffmpeg: Option<&Path>) -> Command {
    let mut cmd = Command::new(ytdlp);
    for a in yt_dlp_args(opts, ffmpeg) {
        cmd.arg(a);
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> DownloadOptions {
        DownloadOptions {
            url: "https://example.com/v".into(),
            target_dir: "/tmp/dl".into(),
            format_id: None,
            settings: crate::Settings::default(),
        }
    }

    #[test]
    fn args_contain_video_only_filter_and_merge() {
        let a = yt_dlp_args(&opts(), Some(Path::new("/usr/bin/ffmpeg")));
        let idx = |needle: &str| a.iter().position(|s| s == needle);
        let i = idx("--match-filter").expect("必须过滤纯图文");
        assert_eq!(a[i + 1], "vcodec!=none");
        assert!(idx("--merge-output-format").is_some());
        assert!(idx("--ffmpeg-location").is_some());
        // TD-DL-006: --no-progress 与 --progress 矛盾,死参数已移除
        assert!(idx("--no-progress").is_none());
        assert!(idx("--progress").is_some());
    }

    #[test]
    fn args_use_selected_format() {
        let mut o = opts();
        o.format_id = Some("137".into());
        let a = yt_dlp_args(&o, None);
        let i = a.iter().position(|s| s == "-f").unwrap();
        assert_eq!(a[i + 1], "137+b/best");
    }

    /// 模板与解析器的 PROGRESS_PREFIX 必须一致——改了模板没改解析器时这里先红。
    #[test]
    fn template_starts_with_progress_prefix() {
        assert!(PROGRESS_TEMPLATE.starts_with(PROGRESS_PREFIX));
    }

    #[test]
    fn cookie_args_come_from_settings_not_per_task_flags() {
        // TD-PROBE-001: cookie 是设置级配置,探测与下载同源
        let mut o = opts();
        o.settings.cookie_mode = Some("browser".into());
        o.settings.cookie_browser = Some("firefox".into());
        let a = yt_dlp_args(&o, None);
        let i = a
            .iter()
            .position(|s| s == "--cookies-from-browser")
            .unwrap();
        assert_eq!(a[i + 1], "firefox");

        let mut o2 = opts();
        o2.settings.cookie_mode = Some("file".into());
        o2.settings.cookie_file = Some("/tmp/cookies.txt".into());
        let a2 = yt_dlp_args(&o2, None);
        let j = a2.iter().position(|s| s == "--cookies").unwrap();
        assert_eq!(a2[j + 1], "/tmp/cookies.txt");

        // 默认(none)不携带 cookie 参数
        assert!(!yt_dlp_args(&opts(), None).contains(&"--cookies-from-browser".to_string()));
    }
}
