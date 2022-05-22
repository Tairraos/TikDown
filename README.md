# tiktok-downloader

### 说明
本项目部分引用了另一个Web下载器的代码 https://github.com/Evil0ctal/Douyin_TikTok_Download_API
谢谢 @Evil0ctal

### 安装
```
pip install -r requirements.txt
```

### 使用
```
python3 tikdown.py
```
如果系统里装了Python Launcher，双击tikdown.py即可执行
默认下载到 ~/Download/tiktok下。需要修改位置请打开代码编辑

界面仅有一个按钮。
1 Hover在Tiktok Desktop里的分享箭头上，选择复制分享链接。
2 点击下载器的"下载剪贴板链接"，稍修即可完成下载
3 单线程下载，如果点击按钮的时候正在下载其它视频，剪贴板链接存入下载列表
## 未来
- 将给下载器上画Log区域，显示下载状态
- 美化一下
