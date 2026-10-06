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
    /// 支持的字段：可能的原因（登录墙、地区限制、私密内容等）
    pub restriction: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quality {
    pub format_id: String,
    pub ext: String,
    pub resolution: String,
    pub height: Option<i64>,
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
        // 明确区分「纯图文」和「探测失败」，UI 要给不同提示
        is_image_only: !has_video,
        qualities,
        restriction: None,
    }
}

fn has_video_stream(raw: &RawJson) -> bool {
    raw.formats
        .iter()
        .any(|f| f.vcodec.as_deref().is_some_and(|v| v != "none"))
}

/// 把 yt-dlp 的 stderr 错误翻译成用户能看懂的中文。
///
/// 这些串经过了实测核对：yt-dlp 遇到登录墙时确实输出
/// "Sign in to confirm your age" / "This content isn't available" 等。
pub fn explain_error(stderr: &str) -> String {
    let s = stderr.to_lowercase();

    let known: [(&str, &str); 8] = [
        (
            "sign in to confirm",
            "该内容需要登录才能访问，请在设置里开启 Cookie 读取（读取本机浏览器登录态）。",
        ),
        ("private", "这是私密内容，需要用对应账号的登录态访问。"),
        ("age", "该内容有年龄限制，需要登录态验证。"),
        (
            "login required",
            "该平台要求登录后才能查看，请开启 Cookie 读取。",
        ),
        ("geo", "该内容有地区限制，当前网络无法访问。"),
        (
            "unsupported url",
            "这个链接 yt-dlp 还不认识，可能需要升级 yt-dlp 版本。",
        ),
        ("404", "内容不存在或已被删除。"),
        (
            "http error 403",
            "被平台拒绝访问（403）。通常是登录态失效或触发了风控，稍后重试或降低频率。",
        ),
    ];

    for (needle, msg) in known {
        if s.contains(needle) {
            return msg.to_string();
        }
    }

    // 兜底：取 stderr 最后一行有效内容，避免整段堆栈糊到界面上
    stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with("ERROR:") || l.len() > 12)
        .unwrap_or("解析失败，未知原因")
        .chars()
        .take(180)
        .collect()
}
