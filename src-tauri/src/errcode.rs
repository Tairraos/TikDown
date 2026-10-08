//! 错误分类：把 yt-dlp 的原始报错映射为**稳定的错误码** + 一句话原因。
//!
//! 为什么不直接返回中文文案（TD-PROBE-006）：
//! - 界面支持中英双语（TD-FE-019）。文案若在后端写死，英文界面就只能看到中文。
//! - 用户要的是"看得懂的解释 + 怎么办"，不是一句"解析失败"——展开成多行
//!   tips（原因 / 怎么办）需要结构化字段，后端回字符串做不到。
//!
//! 所以后端只回`(code, 摘要)`，**详细解释与处置建议由前端按界面语言渲染**。
//! 两端的 code 集合必须一致——由 `tests/unit/error-codes.test.ts` 锁定。

/// 错误码。前端 `ErrorCode` 联合类型与之逐一对应，改一侧必须改另一侧。
///
/// `Unknown` 是刻意保留的兜底：yt-dlp 的报错文本随时会变（上游改文案），
/// 分类表必然滞后，所以必须有"不认识就走通用解释"的路径，不能让界面显示空白。
pub const CODES: &[(&str, &str)] = &[
    // ---- 登录墙类：都需要 Cookie ----
    ("SignInRequired", "sign in to confirm"),
    ("LoginRequired", "login required"),
    ("PrivateContent", "private"),
    ("AgeRestricted", "age restriction"),
    // ---- 客户端/上游问题：加 Cookie 反而更糟（TD-PROBE-005 的教训） ----
    ("PlayerClientUnplayable", "the page needs to be reloaded"),
    ("PotTokenRequired", "nsig extraction failed"),
    // ---- 网络类 ----
    ("GeoBlocked", "geo"),
    ("HttpForbidden", "http error 403"),
    ("HttpNotFound", "404"),
    ("NetworkUnreachable", "unable to download webpage"),
    ("ProxyError", "proxy"),
    // ---- 组件类 ----
    ("UnsupportedUrl", "unsupported url"),
    ("ExtractorMissing", "no suitable extractor"),
    // ---- 兜底 ----
    ("Unknown", ""),
];

/// 分类结果：错误码 + 一句话原因（中文，供状态栏与任务行用；界面正文走前端翻译）。
///
/// `summary` 用 `String` 而非 `&'static str`：内部错误（组件缺失、JSON 解析失败）
/// 携带的是运行时拼出的文案。`code` 保持 `&'static str`——它只来自 CODES 静态表。
#[derive(Debug, Clone, PartialEq)]
pub struct Classified {
    pub code: &'static str,
    pub summary: String,
}

/// 把 yt-dlp 的 stderr 分类。
///
/// **顺序敏感**：登录墙与客户端问题要先于通用网络错误判定——
/// "Sign in to confirm your age" 里含 "sign in"，而 403 类报错可能同时含
/// 多个关键词，先匹配到的优先。
pub fn classify(stderr: &str) -> Classified {
    let s = stderr.to_lowercase();

    // 先判客户端类：这条最容易被后面的通用规则盖掉，而它恰恰最需要精确提示
    for (code, needle) in [
        ("PlayerClientUnplayable", "the page needs to be reloaded"),
        ("PotTokenRequired", "nsig extraction failed"),
    ] {
        if s.contains(needle) {
            return Classified {
                code,
                summary: String::from("YouTube 客户端解码失败，加 Cookie 反而更容易触发。"),
            };
        }
    }

    // 登录墙：注意不能用裸 "age" 作关键词——"message"/"storage" 都含 "age"，
    // 会把任意报错误判成年龄限制（单测发现）。yt-dlp 实际输出是
    // "Confirmed age restriction" / "Sign in to confirm your age"。
    for (code, needle) in [
        ("AgeRestricted", "confirm your age"),
        ("AgeRestricted", "age restriction"),
        ("SignInRequired", "sign in to confirm"),
        ("LoginRequired", "login required"),
        ("PrivateContent", "private video"),
        ("PrivateContent", "this video is private"),
    ] {
        if s.contains(needle) {
            return Classified {
                code,
                // 摘要写进状态栏一行，必须自带下一步——只说"需要登录"等于没说
                summary: String::from(
                    "该内容需要登录：请在设置里配置 Cookie（浏览器登录态或 cookies.txt 文件）",
                ),
            };
        }
    }

    // 网络与组件
    for (code, needle) in [
        ("ProxyError", "proxy"),
        ("NetworkUnreachable", "unable to download webpage"),
        ("NetworkUnreachable", "connection refused"),
        ("NetworkUnreachable", "timed out"),
        ("HttpForbidden", "http error 403"),
        ("HttpForbidden", "forbidden"),
        ("GeoBlocked", "geo"),
        ("GeoBlocked", "not available in your country"),
        ("UnsupportedUrl", "unsupported url"),
        ("ExtractorMissing", "no suitable extractor"),
        ("HttpNotFound", "404"),
    ] {
        if s.contains(needle) {
            return Classified {
                code,
                summary: String::from(summary_for(code)),
            };
        }
    }

    Classified {
        code: "Unknown",
        summary: raw_tail(stderr),
    }
}

fn summary_for(code: &str) -> &'static str {
    match code {
        "ProxyError" => "网络代理连接失败。",
        "NetworkUnreachable" => "连不上平台服务器，检查网络或代理设置。",
        "HttpForbidden" => "被平台拒绝访问（403），通常是登录态失效或触发风控。",
        "GeoBlocked" => "该内容有地区限制，当前网络无法访问。",
        "UnsupportedUrl" => "这个链接 yt-dlp 还不认识，可能需要升级 yt-dlp。",
        "ExtractorMissing" => "yt-dlp 找不到能解析该链接的提取器。",
        "HttpNotFound" => "内容不存在或已被删除。",
        _ => "解析失败。",
    }
}

/// 兜底摘要：取最后一行非空内容，剥掉 ERROR: 前缀，避免整段堆栈糊到界面上。
/// 截断到 120 字符——这是给状态栏的一行摘要，不是日志。
fn raw_tail(stderr: &str) -> String {
    let line = stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("解析失败，未知原因");
    let line = line.strip_prefix("ERROR:").unwrap_or(line).trim();
    let mut out = String::new();
    for c in line.chars().take(120) {
        out.push(c);
    }
    out
}

/// 兼容旧调用点：只要一句话中文的场合（如下载失败事件）用这个。
pub fn explain_error(stderr: &str) -> String {
    let c = classify(stderr);
    if c.code == "Unknown" {
        c.summary.to_string()
    } else {
        format!("{}（{}）", c.summary, c.code)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_login_wall() {
        assert_eq!(
            classify("ERROR: Sign in to confirm your age").code,
            "AgeRestricted"
        );
        assert_eq!(
            classify("ERROR: Sign in to confirm you're not a bot").code,
            "SignInRequired"
        );
        assert_eq!(
            classify("ERROR: This video is private").code,
            "PrivateContent"
        );
    }

    /// 核心误判防护："age" 子串陷阱。
    /// "message"/"storage" 都含 age，不能判成年龄限制（TD-PROBE-004 复发防护）。
    #[test]
    fn bare_age_substring_never_means_age_restriction() {
        for s in [
            "ERROR: some long failure message here",
            "ERROR: out of storage space",
            "ERROR: storage backend unavailable",
        ] {
            assert_ne!(classify(s).code, "AgeRestricted", "{s} 被误判");
        }
    }

    /// TD-PROBE-005 的核心症状必须精确命中，且优先级高于通用网络错误——
    /// 这条报错常与 403 同时出现，先匹配到 403 就会给出错误建议。
    #[test]
    fn player_client_error_beats_generic_http_errors() {
        let e = "ERROR: [youtube] QuOv241ORM8: The page needs to be reloaded. \
                 (tv_downgraded player response playability status: UNPLAYABLE)";
        assert_eq!(classify(e).code, "PlayerClientUnplayable");
        let with403 = format!("{e} HTTP Error 403: Forbidden");
        assert_eq!(classify(&with403).code, "PlayerClientUnplayable");
    }

    #[test]
    fn classifies_network_and_component() {
        assert_eq!(
            classify("ERROR: Unable to download webpage: proxy").code,
            "ProxyError"
        );
        assert_eq!(
            classify("ERROR: Unable to download webpage").code,
            "NetworkUnreachable"
        );
        assert_eq!(
            classify("ERROR: HTTP Error 403: Forbidden").code,
            "HttpForbidden"
        );
        assert_eq!(
            classify("ERROR: Unsupported URL: https://x.com/a").code,
            "UnsupportedUrl"
        );
        assert_eq!(classify("ERROR: 404 Not Found").code, "HttpNotFound");
    }

    #[test]
    fn unknown_falls_back_to_raw_tail_truncated() {
        let long = "ERROR: ".to_string() + &"x".repeat(500);
        let c = classify(&long);
        assert_eq!(c.code, "Unknown");
        assert!(c.summary.chars().count() <= 120, "摘要应截断，不糊整段堆栈");
        assert!(!c.summary.starts_with("ERROR:"));
    }

    #[test]
    fn empty_stderr_does_not_panic() {
        assert_eq!(classify("").code, "Unknown");
        assert_eq!(classify("").summary, "解析失败，未知原因");
    }

    /// code 集合的唯一性：前端按 code 查翻译表，重复会让其中一个永远查不到。
    #[test]
    fn codes_are_unique() {
        let mut seen = std::collections::HashSet::new();
        for (code, _) in CODES {
            assert!(seen.insert(*code), "错误码重复：{code}");
        }
    }
}
