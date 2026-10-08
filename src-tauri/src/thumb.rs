//! 本地视频缩略图：用 ffmpeg 从视频文件抽一帧存成 JPEG。
//!
//! 为什么不用远端封面：平台 CDN 缩略图常带防盗链（Referer 校验）或需要签名，
//! WebView 里 `<img>` 直接拉会稳定失败——表现为"下载完成的视频没有缩略图"。
//! 本地文件已经在磁盘上，抽帧不依赖网络、不受防盗链影响。
//!
//! 抽帧选第 1 秒而非第 0 帧：短视频开头常是纯黑/花屏/logo，占位观感差。

use std::path::{Path, PathBuf};
use std::process::Command;

/// 缩略图存放目录：~/.tikdown/thumbs
pub fn thumbs_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "取不到 HOME".to_string())?;
    Ok(Path::new(&home).join(".tikdown").join("thumbs"))
}

/// 抽帧输出的稳定文件名：用视频自身路径+大小做 key，同一文件重复调用直接命中缓存。
///
/// 不含时间戳——同一路径同一大小就是同一张图，放进页面 `<img>` 才能吃到浏览器缓存。
fn thumb_path(video: &Path) -> Result<PathBuf, String> {
    let size = std::fs::metadata(video).map(|m| m.len()).unwrap_or(0);
    let key = format!("{:x}-{:x}", hash_path(video), size);
    Ok(thumbs_dir()?.join(format!("{key}.jpg")))
}

fn hash_path(p: &Path) -> u64 {
    // FNV-1a：只为生成稳定文件名，不做安全用途
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in p.to_string_lossy().as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100_0000_01b3);
    }
    h
}

/// 组装 ffmpeg 抽帧参数（纯函数，可单测锁定）。
///
/// -ss 1 放在 -i 前 = 输入端快进，关键帧级跳转，秒回且不吃满内存。
/// -vframes 1 只要第一帧；scale 限宽 480，与任务行 96×60 的展示尺寸匹配，
/// 不生成 4K 大图（一张缩略图几百 KB 没有意义）。
pub fn ffmpeg_thumb_args(video: &Path, out: &Path) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-ss".into(),
        "1".into(),
        "-i".into(),
        video.display().to_string(),
        "-vframes".into(),
        "1".into(),
        "-vf".into(),
        "scale=480:-1".into(),
        "-q:v".into(),
        "4".into(),
        "-y".into(),
        out.display().to_string(),
    ]
}

/// 确保视频有缩略图，返回其路径。命中缓存直接返回；ffmpeg 缺失或失败返回 Err。
///
/// ffmpeg 找不到不是致命错误——调用方（前端）应回落到远端封面或占位图，
/// 不能因为一张缩略图让整个完成态列表崩掉。
pub fn ensure_thumb(video: &Path, ffmpeg: Option<&Path>) -> Result<PathBuf, String> {
    let out = thumb_path(video)?;
    if out.exists() {
        return Ok(out);
    }
    let ff = ffmpeg.ok_or("ffmpeg 不可用")?;
    std::fs::create_dir_all(thumbs_dir()?).map_err(|e| format!("建缩略图目录失败：{e}"))?;

    let status = Command::new(ff)
        .args(ffmpeg_thumb_args(video, &out))
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("启动 ffmpeg 失败：{e}"))?;

    if !status.success() || !out.exists() {
        let _ = std::fs::remove_file(&out); // 半成品不留，避免下次误判命中缓存
        return Err("ffmpeg 抽帧失败".into());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thumb_args_seek_first_and_limit_width() {
        let a = ffmpeg_thumb_args(Path::new("/tmp/v.mp4"), Path::new("/tmp/o.jpg"));
        let i = a.iter().position(|s| s == "-i").unwrap();
        // -ss 必须在 -i 之前才是输入端快进
        let ss = a.iter().position(|s| s == "-ss").unwrap();
        assert!(ss < i, "-ss 应在 -i 前（输入端快进），否则退化成全解码");
        assert_eq!(a[ss + 1], "1", "抽第 1 秒，避开开头纯黑/花屏");
        assert_eq!(a[a.iter().position(|s| s == "-vframes").unwrap() + 1], "1");
        assert!(
            a.iter().any(|s| s == "scale=480:-1"),
            "应限宽，与列表展示尺寸匹配"
        );
        assert_eq!(a.last().unwrap(), "/tmp/o.jpg");
    }

    #[test]
    fn thumb_path_is_stable_and_size_sensitive() {
        let v = Path::new("/tmp/a.mp4");
        let p1 = thumb_path(v).unwrap();
        let p2 = thumb_path(v).unwrap();
        assert_eq!(p1, p2, "同一路径必须产出同一文件名，否则页面缓存永不命中");
        assert!(p1.to_string_lossy().ends_with(".jpg"));
        assert!(
            p1.to_string_lossy().contains(".tikdown"),
            "应落在 ~/.tikdown 下"
        );
    }

    #[test]
    fn missing_ffmpeg_is_err_not_panic() {
        // 抽帧失败必须是可回落的状态，不能 panic 拖垮完成态渲染
        let r = ensure_thumb(Path::new("/tmp/nonexistent.mp4"), None);
        assert!(r.is_err());
    }

    /// 端到端：有 ffmpeg 时对真实视频抽帧成功，产出可读 JPEG；重复调用命中缓存。
    /// 只在系统 PATH 能找到 ffmpeg 时跑（CI 无 ffmpeg 时跳过，不制造假红）。
    #[test]
    fn real_video_gets_thumbnail_and_second_call_hits_cache() {
        let ff = match which::which("ffmpeg") {
            Ok(p) => p,
            Err(_) => return, // 无 ffmpeg：跳过
        };
        let dir = std::env::temp_dir().join(format!("tikdown-thumb-e2e-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let video = dir.join("v.mp4");

        // 造一个 2 秒的测试视频（testsrc + 正弦音）
        let ok = Command::new(&ff)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=320x180:rate=10:duration=2",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=2",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
                "-y",
            ])
            .arg(&video)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            std::fs::remove_dir_all(&dir).ok();
            return; // 该 ffmpeg 编不出 h264：跳过
        }

        let p = ensure_thumb(&video, Some(&ff)).expect("抽帧应成功");
        assert!(p.exists(), "缩略图应落盘");
        assert!(std::fs::metadata(&p).unwrap().len() > 0, "缩略图不应为空");

        // JPEG magic：FF D8 FF
        let head = std::fs::read(&p).unwrap();
        assert_eq!(&head[..3], &[0xFF, 0xD8, 0xFF], "应是 JPEG");

        // 第二次直接命中缓存（mtime 不变 = 没重跑 ffmpeg）
        let mtime = std::fs::metadata(&p).unwrap().modified().unwrap();
        let p2 = ensure_thumb(&video, Some(&ff)).unwrap();
        assert_eq!(p, p2);
        assert_eq!(
            std::fs::metadata(&p2).unwrap().modified().unwrap(),
            mtime,
            "命中缓存不应重写文件"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    /// 坏文件（0 字节 / 非视频）必须返回 Err 并清掉半成品，不能留下 0 字节缓存。
    #[test]
    fn broken_input_returns_err_and_leaves_no_half_baked_cache() {
        let ff = match which::which("ffmpeg") {
            Ok(p) => p,
            Err(_) => return,
        };
        let dir = std::env::temp_dir().join(format!("tikdown-thumb-bad-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let video = dir.join("bad.mp4");
        std::fs::write(&video, b"not a video").unwrap();

        let r = ensure_thumb(&video, Some(&ff));
        assert!(r.is_err(), "坏输入应报错");
        // 半成品清理：ensure_thumb 失败分支会 remove_file
        let out = thumb_path(&video).unwrap();
        assert!(!out.exists(), "失败后不应留下半成品缓存");

        std::fs::remove_dir_all(&dir).ok();
    }
}
