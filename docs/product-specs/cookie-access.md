# Cookie 获取方法（登录墙解决方案设计）

> 状态：设计定稿（2026-10-06，用户确认方向）。实现于下载域/探测域（批次 5）。
> 原则（core-beliefs #20）：读取登录态是用户显式授权行为；应用不存储、不外发 Cookie，只把它交给本机的 yt-dlp 子进程。

## 用户引导文案（设置面板展示）

> 小红书、Instagram、抖音等平台的内容需要登录后才能访问。TikDown 不内置账号体系，有两种方式把你的登录状态提供给下载器，二选一即可。

## 方式 A：读取浏览器登录态（推荐，零门槛）

1. 用你**平时登录过目标平台**的浏览器，先在该平台网页上确认已登录。
2. 在 TikDown 设置里开启「读取浏览器登录态」并选择该浏览器。
3. 探测与下载会自动带上登录态。

**注意事项（文案中如实展示）：**

- 部分浏览器在运行时锁定 Cookie 数据库：如果读取失败，**完全退出浏览器**（含后台进程）再试。
- Windows 上 Chrome 近年版本加密了本机 Cookie，读取可能失败——此时请改用 Firefox/Edge，或用方式 B。
- Safari 支持标记为实验性。
- 隐私说明：登录态只在本机与 yt-dlp 之间传递，用于访问你要下载的内容；应用不保存、不上传。

## 方式 B：导入 cookies.txt 文件（最可靠，跨平台）

1. 在已登录目标平台的浏览器里，安装导出扩展（如「Get cookies.txt LOCALLY」，离线工作、不上传数据）。
2. 打开目标平台页面，用扩展导出 Netscape 格式的 `cookies.txt`。
3. 在 TikDown 设置里选择「cookies.txt 文件」并选中该文件。
4. 换浏览器/换电脑时重导一次即可；登录态过期后重新导出。

## 已知问题：YouTube + 登录态需换播放器客户端（TD-PROBE-005）

**现象**：勾选任一 cookie 方式后，所有 YouTube 视频都失败并报：

```
[youtube] QuOv241ORM8: The page needs to be reloaded.
```

**这不是用户的 cookie 有问题**，也不是 Edge/Chrome 的问题。根因（yt-dlp issue #17389，2026-08）：

> `tv_downgraded`（登录用户的默认客户端）现在对一部分人有问题，无法使用。

带 cookie 会让 yt-dlp 切到 `tv_downgraded` 客户端，而它目前解不开 TVHTML5 的
JS 签名，于是判定为 UNPLAYABLE。**不传 cookie 反而一切正常**——所以现象极具
迷惑性：同一条链接在浏览器里能播，App 里却失败。

**已采取的处置**：cookie 生效且 URL 是 YouTube 时，自动追加
`--extractor-args "youtube:player_client=default,web_embedded"` 绕开该客户端
（`probe::probe_args`，探测与下载同源下发）。

**注意**：

- 该 workaround 是**上游临时解法**，yt-dlp 合并 SABR 支持后应当移除——届时上游
  会自行换客户端。代码里已注明来源与背景，便于日后判断何时删。
- 上游反馈：`web_embedded` 方案对点播有效，但**录制进行中的直播**约 4 分钟后会
  403 循环；此时不传 cookie 反而能正常录制。
- 若哪天 YouTube 行为再变，先查 `cookie_args_modes` 之外的 `probe_args` 测试是否
  仍然成立，再考虑升级 yt-dlp。

## 实现约定（给维护者的接口约束）

- 后端设置结构：`cookieMode: none | browser | file`；`browser: chrome|firefox|edge|brave|safari`；`cookieFile: path`。
- yt-dlp 参数映射：`browser` → `--cookies-from-browser <name>`；`file` → `--cookies <path>`。
- **一律走 `probe::probe_args(url, mode, browser, file)`**（不要再直接调 `cookie_args`）：
  它 = cookie 参数 + 平台兼容参数。YouTube 那一项是 TD-PROBE-005 的 workaround，
  绕过它就回到 "The page needs to be reloaded"。
- **探测（probe_batch）与下载（start_download）必须同享同一 Cookie 设置**——登录墙内容在探测步就会失败，只给下载加 Cookie 无法形成闭环。同理，兼容参数也必须两边同时下发。
- 失败翻译（explain_error）命中登录墙关键词时，提示文案指向上述两种方式而非笼统报错。
