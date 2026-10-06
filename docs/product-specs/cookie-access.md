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

## 实现约定（给维护者的接口约束）

- 后端设置结构：`cookieMode: none | browser | file`；`browser: chrome|firefox|edge|brave|safari`；`cookieFile: path`。
- yt-dlp 参数映射：`browser` → `--cookies-from-browser <name>`；`file` → `--cookies <path>`。
- **探测（probe_batch）与下载（start_download）必须同享同一 Cookie 设置**——登录墙内容在探测步就会失败，只给下载加 Cookie 无法形成闭环。
- 失败翻译（explain_error）命中登录墙关键词时，提示文案指向上述两种方式而非笼统报错。
