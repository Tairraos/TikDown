/**
 * 错误解释与处置建议（TD-PROBE-006）。
 *
 * **为什么文案在前端而后端只回错误码**：
 * - 界面支持中英双语（TD-FE-019）。文案写死后端，英文界面就只能看到中文。
 * - 用户要的是"看得懂 + 怎么办"，需要多行结构（原因 / 怎么办 / 注意），
 *   后端回字符串做不到。
 *
 * 后端 `errcode.rs` 只负责把 yt-dlp 原始报错归类成稳定 code，两侧的 code 集合
 * 必须一致——由 `tests/unit/error-codes.test.ts` 锁定。
 *
 * 每个 code 三段结构：
 *  - cause  为什么失败（说人话，不用术语）
 *  - fix    怎么办（可执行，具体到点哪个设置）
 *  - note   补充注意（易踩的坑；没有就不写）
 */

export type ErrorCode =
  | "SignInRequired"
  | "LoginRequired"
  | "PrivateContent"
  | "AgeRestricted"
  | "PlayerClientUnplayable"
  | "PotTokenRequired"
  | "GeoBlocked"
  | "HttpForbidden"
  | "HttpNotFound"
  | "NetworkUnreachable"
  | "ProxyError"
  | "UnsupportedUrl"
  | "ExtractorMissing"
  | "Unknown";

export interface ErrorAdvice {
  /** 为什么失败 */
  cause: string;
  /** 怎么办——必须可执行，具体到点哪个设置 */
  fix: string;
  /** 补充注意；无则省略 */
  note?: string;
}

type AdviceTable = Record<ErrorCode, ErrorAdvice>;

const zh: AdviceTable = {
  SignInRequired: {
    cause: "这条内容要求登录后才能查看，你当前没带登录状态。",
    fix: "打开「设置 → Cookie」，选「浏览器登录态」并挑你平时登录该平台的浏览器；或用扩展导出 cookies.txt 后选「cookies.txt 文件」。",
    note: "选浏览器前先在浏览器里确认已登录——App 读的是浏览器本地的登录态，浏览器里没登录等于没有。",
  },
  LoginRequired: {
    cause: "平台要求登录后才返回内容，App 拿到的是未登录页面。",
    fix: "在「设置 → Cookie」里启用浏览器登录态（选你实际登录过的浏览器），或导入 cookies.txt 文件。",
  },
  PrivateContent: {
    cause: "这是私密内容，只有上传者本人或被授权的账号能看到。",
    fix: "换一个已登录该账号的浏览器登录态再试；如果本来就不该被你看到，那就到此为止。",
  },
  AgeRestricted: {
    cause: "内容有年龄限制，需要登录并确认年龄后才能看。",
    fix: "在「设置 → Cookie」里启用浏览器登录态，确认该账号已通过年龄验证，再重试。",
  },
  PlayerClientUnplayable: {
    cause: "YouTube 拒绝了当前的播放器请求。这不是你 Cookie 的问题——恰恰相反，加上 Cookie 后 yt-dlp 会改走另一个播放器通道，而那个通道目前解不开 YouTube 的加密签名，于是所有视频都报这个错。",
    fix: "临时办法：在「设置 → Cookie」里把 Cookie 关掉。公开视频本来就不需要登录态，关掉后多数内容能正常下载。",
    note: "这是 yt-dlp 上游正在修的问题（社区编号 #17389），不是你的账号或网络有毛病。我们已内置绕过参数，但对部分视频仍会失效；等上游修复后即可恢复。",
  },
  PotTokenRequired: {
    cause: "YouTube 要求额外的访问令牌才能取到视频地址，属于上游反爬策略变化。",
    fix: "先更新 yt-dlp 到最新版；仍不行多半是平台临时策略，等上游跟进。",
  },
  GeoBlocked: {
    cause: "内容有地区限制，你当前的网络出口在不可用区域内。",
    fix: "换一个出口网络再试。注意：App 不提供代理设置，需要在系统网络层处理。",
  },
  HttpForbidden: {
    cause: "平台直接拒绝了这次请求（403）。通常是登录态已失效，或短时间内请求太频繁触发了风控。",
    fix: "先在浏览器里重新登录并打开一次该内容，再回 App 重试；仍然失败就等几分钟，避免连续重试。",
  },
  HttpNotFound: {
    cause: "内容不存在或已被作者删除。",
    fix: "确认链接是否完整；如果在浏览器里也打不开，那内容确实没了。",
  },
  NetworkUnreachable: {
    cause: "连不上平台服务器，请求没能送达。",
    fix: "检查网络连接；如果你的网络需要代理，注意 App 不会自动读取终端里的代理设置，需在系统网络层配置。",
  },
  ProxyError: {
    cause: "网络代理连接失败，请求在代理这一层就断了。",
    fix: "检查代理软件是否在运行、端口是否正确；浏览器能正常打开该网站说明网络本身没问题。",
  },
  UnsupportedUrl: {
    cause: "yt-dlp 还认不出这个链接的格式。",
    fix: "在「设置 → 核心组件」里更新 yt-dlp 到最新版；已是最新版则说明该平台暂未支持。",
  },
  ExtractorMissing: {
    cause: "yt-dlp 里没有能解析该链接的提取器。",
    fix: "更新 yt-dlp 后重试；仍失败说明这个平台尚未被支持。",
  },
  Unknown: {
    cause: "没能识别出具体的失败原因。",
    fix: "先更新 yt-dlp 再重试一次；若仍失败，把这条链接和状态栏里的原始报错记下来反馈给我们。",
  },
};

const en: AdviceTable = {
  SignInRequired: {
    cause: "This content requires you to be signed in, and no login state was supplied.",
    fix: "Open Settings → Cookie, pick \"Browser cookies\" and choose the browser you normally sign in with; or export cookies.txt with an extension and pick that file.",
    note: "Make sure you're actually signed in inside that browser first — the app reads the browser's local session, so not being signed in there means having no session at all.",
  },
  LoginRequired: {
    cause: "The platform only returns the content to signed-in visitors; the app received the anonymous page.",
    fix: "Enable browser cookies in Settings → Cookie (pick the browser you actually use), or import a cookies.txt file.",
  },
  PrivateContent: {
    cause: "This is private content, viewable only by the uploader or authorised accounts.",
    fix: "Retry with a browser profile signed into an authorised account. If you shouldn't have access anyway, this one's a dead end.",
  },
  AgeRestricted: {
    cause: "The content is age-gated and needs a signed-in, age-verified session.",
    fix: "Enable browser cookies in Settings → Cookie, make sure that account has passed age verification, then retry.",
  },
  PlayerClientUnplayable: {
    cause: "YouTube rejected the player request. This is not a problem with your cookies — in fact it's the opposite: once cookies are supplied, yt-dlp switches to a different player channel, and that channel currently can't decrypt YouTube's signatures, so every video fails this way.",
    fix: "Workaround: turn cookies off in Settings → Cookie. Public videos don't need a session anyway, and most of them download fine with cookies disabled.",
    note: "This is an upstream yt-dlp issue (#17389) currently being fixed — not your account or network. A workaround is built in but still fails on some videos; it should recover once upstream lands a fix.",
  },
  PotTokenRequired: {
    cause: "YouTube demands an additional access token before handing out the video URL — an upstream anti-scraping change.",
    fix: "Update yt-dlp to the latest version first. If it persists, it's a temporary platform policy; wait for upstream.",
  },
  GeoBlocked: {
    cause: "The content is region-locked and your current network exit isn't in an allowed region.",
    fix: "Try a different network exit. Note the app has no proxy setting of its own — handle that at the OS network layer.",
  },
  HttpForbidden: {
    cause: "The platform rejected the request outright (403). Usually a stale session, or rate limiting after too many quick requests.",
    fix: "Re-sign in inside the browser and open the content there once, then retry in the app. If it still fails, wait a few minutes and avoid repeated retries.",
  },
  HttpNotFound: {
    cause: "The content doesn't exist or has been deleted by the uploader.",
    fix: "Check that the link is complete. If it doesn't open in your browser either, the content is genuinely gone.",
  },
  NetworkUnreachable: {
    cause: "The platform server could not be reached — the request never got through.",
    fix: "Check your network connection. If your network needs a proxy, note the app does not read proxy settings from your terminal; configure it at the OS network layer.",
  },
  ProxyError: {
    cause: "The network proxy failed — the request broke at the proxy layer.",
    fix: "Check that the proxy app is running and the port is right. If the site opens fine in your browser, your network itself is OK.",
  },
  UnsupportedUrl: {
    cause: "yt-dlp doesn't recognise this link's format yet.",
    fix: "Update yt-dlp in Settings → Core components. If it's already current, the platform isn't supported yet.",
  },
  ExtractorMissing: {
    cause: "yt-dlp has no extractor able to parse this link.",
    fix: "Update yt-dlp and retry. If it still fails, the platform isn't supported.",
  },
  Unknown: {
    cause: "The specific failure reason couldn't be identified.",
    fix: "Update yt-dlp and retry once. If it persists, please send us the link along with the raw error shown in the status bar.",
  },
};

const TABLES: Record<"zh" | "en", AdviceTable> = { zh, en };

/** 错误码集合——与 Rust `errcode::CODES` 逐一对应，由契约测试锁定 */
export const ERROR_CODES = Object.keys(zh) as ErrorCode[];

/**
 * 取某个错误码的解释。未知 code 回落 Unknown——
 * 上游随时会改报错文案（这是已发生过的），分类表必然滞后，
 * 但界面不能因此显示空白。
 */
export function adviceFor(code: string | null | undefined, lang: "zh" | "en"): ErrorAdvice {
  const table = TABLES[lang] ?? zh;
  if (code && code in table) return table[code as ErrorCode];
  return table.Unknown;
}

/** tips 泡泡的多行文本。格式刻意分三段，用户扫一眼就知道「为什么 / 怎么办 / 注意」。
 *
 * 冒号按语言给：中文用全角「：」，英文用半角 ": "——混用会让英文界面显得
 * 像没本地化完（这个细节由 error-codes.test.ts 的全英文断言守住）。 */
export function adviceLines(code: string | null | undefined, lang: "zh" | "en"): string[] {
  const a = adviceFor(code, lang);
  const sep = lang === "zh" ? "：" : ": ";
  const [causePrefix, fixPrefix, notePrefix] =
    lang === "zh" ? ["原因", "怎么办", "注意"] : ["Why", "Fix", "Note"];
  const out = [`${causePrefix}${sep}${a.cause}`, `${fixPrefix}${sep}${a.fix}`];
  if (a.note) out.push(`${notePrefix}${sep}${a.note}`);
  return out;
}
