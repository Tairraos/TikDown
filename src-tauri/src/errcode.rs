//! 错误分类：把 yt-dlp 的原始报错映射为**稳定的错误码** + 一句话原因。
//!
//! 为什么不直接返回中文文案（TD-PROBE-006）：
//! - 界面支持中英双语（TD-FE-019）。文案若在后端写死，英文界面就只能看到中文。
//! - 用户要的是"看得懂的解释 + 怎么办"，不是一句"解析失败"——展开成多行
//!   tips（原因 / 怎么办）需要结构化字段，后端回字符串做不到。
//!
//! 所以后端只回`(code, 摘要)`，**详细解释与处置建议由前端按界面语言渲染**。
//! 两端的 code 集合必须一致——由 `tests/unit/error-codes.test.ts` 锁定。

/// 错误码 → yt-dlp 报错关键词。**分类的唯一真源**（TD-PROBE-006）。
///
/// 前端 `ErrorCode` 联合类型与之逐一对应，改一侧必须改另一侧；
/// 两侧集合一致性由 `tests/unit/error-codes.test.ts` 锁定。
///
/// **顺序即优先级**：先匹配到的赢。登录墙与客户端问题必须排在通用网络错误之前
/// ——"Sign in to confirm your age" 含 "sign in"，而客户端报错常与 403 同时出现，
/// 先匹配到 403 就会给出错误建议。
///
/// `Unknown` 是刻意保留的兜底：yt-dlp 的报错文本随时会变（上游改文案），
/// 分类表必然滞后，所以必须有"不认识就走通用解释"的路径，不能让界面显示空白。
///
/// 注意关键词刻意收窄：不能用裸 "age"（"message"/"storage" 都含 age，
/// 会把任意报错误判成年龄限制——这个坑已踩过一次）。
pub const CODES: &[(&str, &str)] = &[
    // ---- 客户端/上游：加 Cookie 反而更糟（TD-PROBE-005 的教训） ----
    ("PlayerClientUnplayable", "the page needs to be reloaded"),
    ("PotTokenRequired", "nsig extraction failed"),
    // ---- 登录墙：都需要 Cookie ----
    ("AgeRestricted", "confirm your age"),
    ("AgeRestricted", "age restriction"),
    ("SignInRequired", "sign in to confirm"),
    ("LoginRequired", "login required"),
    ("PrivateContent", "this video is private"),
    ("PrivateContent", "private video"),
    // ---- 网络类 ----
    ("ProxyError", "proxy"),
    ("NetworkUnreachable", "unable to download webpage"),
    ("NetworkUnreachable", "connection refused"),
    ("NetworkUnreachable", "timed out"),
    ("HttpForbidden", "http error 403"),
    ("HttpForbidden", "forbidden"),
    ("GeoBlocked", "geo"),
    ("GeoBlocked", "not available in your country"),
    // ---- 组件类 ----
    ("UnsupportedUrl", "unsupported url"),
    ("ExtractorMissing", "no suitable extractor"),
    ("HttpNotFound", "404"),
    // ---- 兜底（不匹配任何关键词，仅保证 code 存在） ----
    ("Unknown", ""),
];

/// 全部已登记的错误码（去重）。
///
/// 运行期用途：`summary_for` 的兜底分支会用到它做一致性自检，
/// 保证「表里新增了 code 却忘了写摘要」这种遗漏在开发期就暴露，
/// 而不是让用户看到空状态栏。
pub fn all_codes() -> Vec<&'static str> {
    let mut v: Vec<&'static str> = CODES.iter().map(|(c, _)| *c).collect();
    v.sort_unstable();
    v.dedup();
    v
}

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
/// 直接查 `CODES` 表，不另写分支——表是唯一真源，两份并行必然漂移。
/// 表内顺序即优先级（见 CODES 文档）。
pub fn classify(stderr: &str) -> Classified {
    let s = stderr.to_lowercase();
    for (code, needle) in CODES {
        // 关键词为空 = 兜底占位，不参与匹配
        if !needle.is_empty() && s.contains(needle) {
            let summary = summary_for(code);
            // 摘要缺失说明分类表与摘要表漂移了。回显原始报错比显示空白好，
            // 同时把可用错误码打到 stderr 便于开发期发现。
            if summary == FALLBACK_SUMMARY {
                eprintln!(
                    "[errcode] 摘要缺失：{code}；已登记错误码 = {:?}",
                    all_codes()
                );
            }
            return Classified {
                code,
                summary: String::from(summary),
            };
        }
    }
    Classified {
        code: "Unknown",
        summary: raw_tail(stderr),
    }
}

/// 兜底摘要（summary_for 的 `_` 分支）。
const FALLBACK_SUMMARY: &str = "解析失败。";

/// 每个 code 的单行中文摘要（进状态栏一行，必须自带下一步）。
fn summary_for(code: &str) -> &'static str {
    match code {
        // 登录墙类：必须点名 Cookie，否则用户不知道下一步做什么
        "SignInRequired" | "LoginRequired" | "PrivateContent" | "AgeRestricted" => {
            "该内容需要登录：请在设置里配置 Cookie（浏览器登录态或 cookies.txt 文件）"
        }
        // 客户端类：说清"不是你的 cookie 问题"，否则用户会反复折腾登录态
        "PlayerClientUnplayable" => "YouTube 客户端解码失败，加 Cookie 反而更容易触发。",
        "PotTokenRequired" => "YouTube 要求额外访问令牌，请更新 yt-dlp 或稍后再试。",
        "ProxyError" => "网络代理连接失败。",
        "NetworkUnreachable" => "连不上平台服务器，检查网络或代理设置。",
        "HttpForbidden" => "被平台拒绝访问（403），通常是登录态失效或触发风控。",
        "GeoBlocked" => "该内容有地区限制，当前网络无法访问。",
        "UnsupportedUrl" => "这个链接 yt-dlp 还不认识，可能需要升级 yt-dlp。",
        "ExtractorMissing" => "yt-dlp 找不到能解析该链接的提取器。",
        "HttpNotFound" => "内容不存在或已被删除。",
        //兜底：与 FALLBACK_SUMMARY 同值，用于 detect-drift 判定
        _ => FALLBACK_SUMMARY,
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

    /// 分类表的自检：每个 code 的关键词非空（Unknown 除外）、无重复 code+关键词。
    ///
    /// 注意**允许同一 code 挂多个关键词**（如 AgeRestricted 有两种 yt-dlp 措辞），
    /// 所以查重是按 (code, keyword) 组合，不是按 code。
    #[test]
    fn codes_table_is_wellformed() {
        let mut seen = std::collections::HashSet::new();
        for (code, needle) in CODES {
            if *code != "Unknown" {
                assert!(
                    !needle.is_empty(),
                    "{code} 的关键词不能为空（只会让表失效）"
                );
            }
            assert!(
                seen.insert((*code, *needle)),
                "表里有重复条目：{code} / {needle}"
            );
        }
    }

    /// 兜底码必须存在，且不带任何关键词（否则会抢在真正分类之前命中）。
    #[test]
    fn unknown_is_the_fallback_and_never_matches() {
        let unknowns: Vec<&str> = CODES
            .iter()
            .filter(|(c, _)| *c == "Unknown")
            .map(|(_, n)| *n)
            .collect();
        assert_eq!(unknowns, vec![""], "Unknown 应恰好一条且关键词为空");
        // 随便什么错都不该被判成 Unknown 之外的码
        assert_eq!(classify("ERROR: something odd").code, "Unknown");
    }

    /// 表里登记的 code 必须都有可用的中文摘要——
    /// 否则状态栏会显示空行，比显示"解析失败"更糟。
    #[test]
    fn every_code_has_a_summary() {
        for code in all_codes() {
            let s = summary_for(code);
            assert!(!s.trim().is_empty(), "{code} 缺摘要");
        }
    }
}
