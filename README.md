Tiktok变更了API的使用规则，需要手机才能获取到视频地址。electron的fetch受webkit安全限制，无法通过js修改user-agent，所以暂时还无法下载。等我研究出解决方案会发布新版本。
抖音没受影响。

# TikDown App [点这里查看中文说明](#中文说明)

This is a TikTok/Douyin downloader built with Electron. Download the video without watermark by pasting the share link in the clipboard.

### Install
- Download the Win/Mac installation package  
https://github.com/Tairraos/TikDown/releases/latest
- Or download the portable version to use directly, which is the package with "portable" in the name.
- The application is only available for Mac and Win. If you want to use it under Linux, please clone this repository and build it yourself.
- Install with brew
```
brew tap Tairraos/tikdown && brew install --cask tikdown
```
- Use this command to check if new version is available
```
brew livecheck tikdown
```
- The Homebrew tap is maintained here  
https://github.com/Tairraos/homebrew-tikdown

### Features
![feature.en](readme/feature.en.svg)


### Comments
- ![Install Chrome App](readme/install%20chrome%20app.png)
- The Chrome app version of TikTok/Douyin works very well. 
- Visit TikTok/Douyin site from Chrome (or any other Chromium based browser), and you will see installation icon on the right of the address bar. 
- If you are looking for a Python application, there is a tiny version of this app writen in Python, with only 100 lines code. [Go to Python Version](https://github.com/Tairraos/tiktok-downloader.py)


### Screenshot
- ![Normal UI](readme/ui.en.png)
- ![Mini UI](readme/miniui.en.png)

### Features will be implemented

- Bug that List is cleared after closing the interface and opening it again.
- Allow to pause, resume, cancel a downloading task.
- Allow to cancel a task that has not been downloaded yet.
- Allow user to select filename template
- Allow user to save download log
- Batch add download URLs, paste in multiple lines at once.
- Remove the counter at the end of the download file name.
- MAYBE: Batch downad all video of a user


****************************************

## 中文说明

基于Electron构建的 TikTok/抖音 下载器。通过粘帖剪贴板里的分享链接下载无水印的视频。

### 安装
- 下载 Win/Mac 安装包：  
https://github.com/Tairraos/TikDown/releases/latest
- 也可以下载便携版直接使用，即文件名里带 "portable" 字样的。
- 仅提供 Mac 和 Win 的 App，如果你需要在 Linux 下使用，请自己克隆仓库编译。
- 或使用brew安装：
```
brew tap Tairraos/tikdown && brew install --cask tikdown
```
- 用这个命令检测是否有新版本。
```
brew livecheck tikdown
```
- Homebrew tap在这里维护：  
https://github.com/Tairraos/homebrew-tikdown

### 功能
![feature.cn](readme/feature.cn.svg)


### 备注
- ![Install Chrome App](readme/install%20chrome%20app.png)
- Chrome app版本的TikTok/Douyin很好用.
- 用Chrome访问TikTok/Douyin网站，在地址栏最右侧有安装图标。
- 如果你在找 Python App, 我有一个100行代码的Pythont版本。 [跳转到Python版本](https://github.com/Tairraos/tiktok-downloader.py)


### 截图
- ![普通界面](readme/ui.cn.png)
- ![迷你界面](readme/miniui.cn.png)

### 将会在后续版本中实现的功能
- BUG: 关闭界面后再打开List被清空。
- 允许暂停，继续，取消一个正在下载的任务。
- 允许取消还未下载的任务。
- 允许用户选择保存的文件名模板。
- 允许用户保存下载日志
- 批量添加下载URL，一次粘帖入多行。
- 移除下载文件名尾部的计数器。
- 可能会做：批量下载某帐号下的所有视频。

****************************************
<details><summary>Reference & Thanks 参考及鸣谢</summary>

- UI Design / UI设计: [MasterGo](https://mastergo.com/file/64638217599752)
- API Information / API 信息: [Github Repo](https://github.com/Evil0ctal/Douyin_TikTok_Download_API)
- background material / 安装程序背景: [TikTok background vector created by BiZkettE1](https://www.freepik.com/vectors/tiktok-background)
- arraw material / 箭头素材： [Trajectory vector created by freepik](https://www.freepik.com/vectors/trajectory)
</details>
