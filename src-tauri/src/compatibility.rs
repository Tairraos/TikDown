//! 平台兼容性 workaround（TD-PROBE-005）。
//!
//! **为什么单独成文件**：这是"绕上游 bug"的参数集合，与解析/错误翻译职责无关，
//! 且**很容易在后续重构中被无意删掉**——它不解决任何本项目自己的问题，
//! 不写测试的人看不出缺了它会怎样。所以独立成模块并自带回归测试。
//!
//! 当前唯一条目：YouTube + 登录态必须换播放器客户端。

/// 从 URL 取 host（小写），失败返回 None。
///
/// 不引 url crate：这里只需 host，手写足够，避免为一个字段加依赖。
pub fn host_of(url: &str) -> Option<String> {
    let rest = url.split_once("://").map(|(_, r)| r)?;
    let authority = rest.split(['/', '?', '#']).next()?;
    let host = authority
        .rsplit_once('@')
        .map(|(_, h)| h)
        .unwrap_or(authority);
    let host = host.split(':').next()?; // 去端口
    if host.is_empty() {
        None
    } else {
        Some(host.to_ascii_lowercase())
    }
}

/// 是 YouTube 吗（覆盖裸域、www、youtu.be 短链、免 cookie 域）。
fn is_youtube(url: &str) -> bool {
    match host_of(url).as_deref() {
        Some(h) => {
            // 覆盖 www. / m.（移动版分享链接常见）；只剥一层，够用
            let base = h
                .strip_prefix("www.")
                .or_else(|| h.strip_prefix("m."))
                .unwrap_or(h);
            matches!(base, "youtube.com" | "youtu.be" | "youtube-nocookie.com")
        }
        None => false,
    }
}

/// 登录态生效时追加的平台兼容参数（TD-PROBE-005）。
///
/// 背景：一旦带上 cookie，yt-dlp 对 YouTube 会改用 `tv_downgraded` 客户端
///（登录用户的默认路径），而该客户端目前解不开 TVHTML5 的 JS 签名，
/// 于是所有 YouTube 视频都报
/// `The page needs to be reloaded (tv_downgraded ... playability status: UNPLAYABLE)`。
/// 用户侧表现极具迷惑性：同一条链接浏览器里能播，App 里却失败。
///
/// 解法来自 yt-dlp 维护者 issue #17389：绕开该客户端，改用 `default,web_embedded`。
///
/// 刻意只对 YouTube 生效：这是 YouTube 客户端选择的问题，不该把参数塞给其他平台
/// ——`--extractor-args` 传平台不认识的键会报错。
///
/// **这是临时解法**：上游合并 SABR 支持后应当移除（届时上游会自行换客户端）。
pub fn args_for(url: &str, using_cookie: bool) -> Vec<String> {
    if !using_cookie || !is_youtube(url) {
        return Vec::new();
    }
    vec![
        "--extractor-args".into(),
        "youtube:player_client=default,web_embedded".into(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 核心行为：YouTube + 登录态必须换客户端。
    #[test]
    fn youtube_with_cookie_switches_player_client() {
        for u in [
            "https://www.youtube.com/watch?v=abc",
            "https://youtube.com/watch?v=abc",
            "https://www.YouTube.com/watch?v=abc",
            "https://youtu.be/abc",
            "https://m.youtube.com/watch?v=abc",
        ] {
            let a = args_for(u, true);
            let i = a
                .iter()
                .position(|s| s == "--extractor-args")
                .unwrap_or_else(|| panic!("{u} 应带客户端参数"));
            assert_eq!(
                a[i + 1],
                "youtube:player_client=default,web_embedded",
                "{u}"
            );
        }
    }

    /// 反例锁定：没 cookie 时不能加参数。匿名下载本来就正常，
    /// 乱加只会绑死 web_embedded 并丢掉可用画质。
    #[test]
    fn no_cookie_no_override() {
        for u in [
            "https://www.youtube.com/watch?v=abc",
            "https://youtu.be/abc",
        ] {
            assert!(args_for(u, false).is_empty(), "{u} 不该带参数");
        }
    }

    /// 反例锁定：非 YouTube 平台不受影响。`--extractor-args` 传平台
    /// 不认识的键会报错，不能无差别撒。
    #[test]
    fn non_youtube_unaffected() {
        for u in [
            "https://v.douyin.com/abc/",
            "https://www.bilibili.com/video/BV1",
            "https://x.com/a/status/1",
            "https://www.instagram.com/p/abc/",
            "https://www.pinterest.com/pin/1/",
        ] {
            assert!(args_for(u, true).is_empty(), "{u} 不该带参数");
        }
    }

    #[test]
    fn host_parsing_edge_cases() {
        assert_eq!(host_of("https://youtu.be/abc").as_deref(), Some("youtu.be"));
        assert_eq!(
            host_of("https://WWW.YouTube.com/watch?v=a").as_deref(),
            Some("www.youtube.com")
        );
        // 带端口 / 带 userinfo / 带查询串
        assert_eq!(
            host_of("https://youtu.be:443/abc?x=1").as_deref(),
            Some("youtu.be")
        );
        assert_eq!(
            host_of("https://user:pw@youtube.com/w").as_deref(),
            Some("youtube.com")
        );
        // 非法输入返回 None，不 panic
        assert_eq!(host_of("not-a-url"), None);
        assert_eq!(host_of(""), None);
    }
}
