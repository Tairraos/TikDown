use serde::{Deserialize, Serialize};

/// 探测结果：一条链接里可下载的视频情况。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub url: String,
    pub title: String,
    pub uploader: String,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub extractor: String,
    /// 是否有至少一个真实视频流（vcodec != none）
    pub has_video: bool,
    /// 该条目是否为纯图文
    pub is_image_only: bool,
    pub qualities: Vec<Quality>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quality {
    pub format_id: String,
    pub ext: String,
    pub resolution: String,
    pub height: Option<i64>,
    pub width: Option<i64>,
    pub vcodec: String,
    pub filesize: Option<i64>,
    pub note: Option<String>,
}

/// yt-dlp --dump-single-json 的输出。只取需要的字段，
/// 其余字段用 Option + serde 默认忽略，避免上游加字段时编译失败。
#[derive(Debug, Clone, Deserialize)]
pub struct RawJson {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    uploader: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    extractor: Option<String>,
    #[serde(default)]
    formats: Vec<RawFormat>,
    #[serde(default)]
    entries: Option<Vec<RawJson>>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawFormat {
    format_id: Option<String>,
    ext: Option<String>,
    #[serde(default)]
    height: Option<i64>,
    #[serde(default)]
    width: Option<i64>,
    #[serde(default)]
    vcodec: Option<String>,
    #[serde(default)]
    filesize: Option<i64>,
    #[serde(default)]
    format_note: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

/// 从 yt-dlp 的 JSON 输出构造 MediaInfo，并判定「只下视频」策略。
pub fn parse(raw: RawJson, url: &str) -> MediaInfo {
    let extractor = raw.extractor.clone().unwrap_or_else(|| "generic".into());

    // playlist / 多条目：取第一个含视频的条目
    let chosen = if raw.formats.is_empty() {
        match raw.entries {
            Some(entries) => entries
                .into_iter()
                .find(has_video_stream)
                .unwrap_or_else(|| RawJson {
                    title: raw.title.clone(),
                    uploader: raw.uploader.clone(),
                    duration: raw.duration,
                    thumbnail: raw.thumbnail.clone(),
                    extractor: raw.extractor.clone(),
                    formats: vec![],
                    entries: None,
                }),
            None => raw,
        }
    } else {
        raw
    };

    let qualities: Vec<Quality> = chosen
        .formats
        .iter()
        .filter(|f| f.vcodec.as_deref() != Some("none"))
        .filter(|f| f.url.is_some() || f.format_id.is_some())
        .map(|f| Quality {
            format_id: f.format_id.clone().unwrap_or_default(),
            ext: f.ext.clone().unwrap_or_default(),
            resolution: f
                .height
                .map(|h| format!("{}p", h))
                .unwrap_or_else(|| "audio only".into()),
            height: f.height,
            width: f.width,
            vcodec: f.vcodec.clone().unwrap_or_default(),
            filesize: f.filesize,
            note: f.format_note.clone(),
        })
        .collect();

    let has_video = !qualities.is_empty();

    MediaInfo {
        url: url.to_string(),
        title: chosen.title.unwrap_or_else(|| "未命名".into()),
        uploader: chosen.uploader.unwrap_or_default(),
        duration: chosen.duration,
        thumbnail: chosen.thumbnail,
        extractor,
        has_video,
        // 探测失败走 Err 通道（explain_error 三分法提示）；
        // 探测成功但无视频流 = 纯图文，UI 据此显示「已跳过」
        is_image_only: !has_video,
        qualities,
    }
}

fn has_video_stream(raw: &RawJson) -> bool {
    raw.formats
        .iter()
        .any(|f| f.vcodec.as_deref().is_some_and(|v| v != "none"))
}

/// 把 yt-dlp 的 stderr 错误翻译成一句话摘要（兼容旧调用点）。
///
/// 分类本体在 `errcode`（TD-PROBE-006）：那边出错误码 + 摘要，这边只做转发，
/// 避免两处各写一份关键词表而漂移。界面上给用户看的完整解释走前端（要双语）。
pub fn explain_error(stderr: &str) -> String {
    crate::errcode::explain_error(stderr)
}
/// 依据 Cookie 设置生成 yt-dlp 参数。
///
/// 刻意以散字段而非 Settings 结构体作入参——probe 保持对设置层的零依赖（T7 白名单）。
/// 探测与下载共用同一份配置——登录墙内容在探测步就会失败，
/// 只给下载加 Cookie 无法形成闭环（TD-PROBE-001，规格见 docs/product-specs/cookie-access.md）。
pub fn cookie_args(
    mode: Option<&str>,
    browser: Option<&str>,
    cookie_file: Option<&str>,
) -> Vec<String> {
    match mode {
        Some("browser") => {
            vec![
                "--cookies-from-browser".into(),
                browser.unwrap_or("chrome").to_string(),
            ]
        }
        Some("file") => match cookie_file {
            Some(p) if !p.is_empty() => vec!["--cookies".into(), p.to_string()],
            _ => vec![],
        },
        _ => vec![],
    }
}

/// Cookie 参数 + 平台兼容参数（探测与下载都走这里）。
///
/// 两者必须成对下发：只给下载加修复，探测那一步就会先失败，
/// 登录墙内容根本走不到下载（TD-PROBE-001 的闭环要求）。
///
/// 兼容参数本体在 `compatibility` 模块（TD-PROBE-005：YouTube 登录态需换客户端）。
pub fn probe_args(
    url: &str,
    mode: Option<&str>,
    browser: Option<&str>,
    cookie_file: Option<&str>,
) -> Vec<String> {
    let cookie = cookie_args(mode, browser, cookie_file);
    let using_cookie = !cookie.is_empty();
    let mut args = cookie;
    args.extend(crate::compatibility::args_for(url, using_cookie));
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(formats: Vec<RawFormat>) -> RawJson {
        RawJson {
            title: Some("测试视频".into()),
            uploader: Some("up".into()),
            duration: Some(60.0),
            thumbnail: None,
            extractor: Some("mock".into()),
            formats,
            entries: None,
        }
    }

    fn fmt(vcodec: &str) -> RawFormat {
        RawFormat {
            format_id: Some("f1".into()),
            ext: Some("mp4".into()),
            height: Some(720),
            width: Some(1280),
            vcodec: Some(vcodec.into()),
            filesize: None,
            format_note: None,
            url: Some("https://x/f.mp4".into()),
        }
    }

    #[test]
    fn parse_marks_image_only_when_all_codecs_are_none() {
        let info = parse(raw(vec![fmt("none")]), "https://a.com/1");
        assert!(!info.has_video);
        assert!(info.is_image_only);
        assert!(info.qualities.is_empty());
    }

    #[test]
    fn parse_keeps_video_entry_and_filters_audio_only_formats() {
        let info = parse(raw(vec![fmt("none"), fmt("avc1")]), "https://a.com/1");
        assert!(info.has_video);
        assert!(!info.is_image_only);
        assert_eq!(info.qualities.len(), 1); // vcodec=none 的格式不进画质列表
    }

    #[test]
    fn parse_picks_first_video_entry_from_playlist() {
        let mut playlist = raw(vec![]);
        playlist.entries = Some(vec![raw(vec![fmt("none")]), raw(vec![fmt("avc1")])]);
        let info = parse(playlist, "https://a.com/pl");
        assert!(info.has_video, "应选中第一个含视频流的条目");
    }

    /// explain_error 已转为转发 errcode（TD-PROBE-006），分类断言在 errcode 模块。
    /// 这里只锁"转发没断"：登录墙必须仍带 Cookie 指引（界面 tips 的正文在��端，
    /// 但摘要要保留可执行信息）。
    #[test]
    fn explain_error_still_routes_login_wall() {
        let msg = explain_error("ERROR: Sign in to confirm you're not a bot");
        assert!(msg.contains("Cookie"), "登录墙应指向 Cookie 配置: {msg}");
    }

    #[test]
    fn explain_error_fallback_strips_error_prefix() {
        let msg = explain_error("WARNING: x\nERROR: some long failure message here");
        assert!(
            !msg.starts_with("ERROR:"),
            "兜底行应剥掉 ERROR: 前缀: {msg}"
        );
        assert!(msg.contains("some long failure"));
    }

    #[test]
    fn cookie_args_modes() {
        assert!(cookie_args(None, None, None).is_empty());

        assert_eq!(
            cookie_args(Some("browser"), None, None),
            vec!["--cookies-from-browser".to_string(), "chrome".to_string()]
        );
        assert_eq!(
            cookie_args(Some("file"), None, Some("/tmp/c.txt")),
            vec!["--cookies".to_string(), "/tmp/c.txt".to_string()]
        );
        // file 模式但未选文件 → 不带参数(而非报错)
        assert!(cookie_args(Some("file"), None, None).is_empty());
    }

    /// TD-PROBE-005 的集成面：probe_args 必须把 cookie 与客户端参数**成对**下发。
    /// 只给下载加修复、探测那步就挂，登录墙内容根本走不到下载。
    /// 拆模块后这里守住"委托没漏"，参数细节由 compatibility 模块自己测。
    #[test]
    fn youtube_with_cookie_switches_player_client() {
        let a = probe_args(
            "https://www.youtube.com/watch?v=abc",
            Some("browser"),
            Some("edge"),
            None,
        );
        let i = a
            .iter()
            .position(|s| s == "--extractor-args")
            .expect("应带客户端参数");
        assert_eq!(a[i + 1], "youtube:player_client=default,web_embedded");
        // cookie 参数仍在，两者并存
        assert!(a.iter().any(|s| s == "--cookies-from-browser"));
    }

    /// 反例锁定：没 cookie 时**不能**加客户端参数。
    /// 匿名下载本来就正常，乱加只会绑死 web_embedded 并丢掉可用画质。
    #[test]
    fn youtube_without_cookie_gets_no_client_override() {
        assert!(probe_args("https://www.youtube.com/watch?v=abc", None, None, None).is_empty());
    }
}
