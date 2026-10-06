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

/// 把 yt-dlp 的 stderr 错误翻译成用户能看懂的中文。
///
/// 这些串经过了实测核对：yt-dlp 遇到登录墙时确实输出
/// "Sign in to confirm your age" / "This content isn't available" 等。
pub fn explain_error(stderr: &str) -> String {
    let s = stderr.to_lowercase();

    let known: [(&str, &str); 8] = [
        (
            "sign in to confirm",
            "该内容需要登录才能访问。请在设置里配置 Cookie：读取浏览器登录态，或导入 cookies.txt 文件。",
        ),
        ("private", "这是私密内容。请在设置里配置已登录对应账号的 Cookie。"),
        ("age", "该内容有年龄限制。请在设置里配置已登录的 Cookie。"),
        (
            "login required",
            "该平台要求登录后才能查看。请在设置里配置 Cookie（浏览器登录态或 cookies.txt 文件）。",
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

    // 兜底：取 stderr 最后一行非空内容，剥掉 ERROR: 前缀，避免整段堆栈糊到界面上。
    // （TD-PROBE-003：原条件 `!empty && !starts_with(ERROR) || len>12` 因优先级，
    //   任何超过 12 字符的 ERROR 行都会原样透传，与意图相悖。）
    let line = stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("解析失败，未知原因");
    line.strip_prefix("ERROR:")
        .unwrap_or(line)
        .trim()
        .chars()
        .take(180)
        .collect()
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
            vec!["--cookies-from-browser".into(), browser.unwrap_or("chrome").to_string()]
        }
        Some("file") => match cookie_file {
            Some(p) if !p.is_empty() => vec!["--cookies".into(), p.to_string()],
            _ => vec![],
        },
        _ => vec![],
    }
}
