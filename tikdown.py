#!/usr/local/bin/python3

import os
import re
import json
import tkinter
import requests
from tenacity import *

download_dir = "~/Downloads/tiktok"  # 配置下载目录

download_dir = os.path.expanduser(download_dir)  # 展开成真实路径
if not os.path.exists(download_dir):
    os.makedirs(download_dir)

download_headers = {
    "user-agent": "Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Mobile Safari/537.36 Edg/87.0.664.66"
}
tiktok_headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "authority": "www.tiktok.com",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
    "Host": "www.tiktok.com",
    "User-Agent": "Mozilla/5.0  (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) coc_coc_browser/86.0.170 Chrome/80.0.3987.170 Safari/537.36",
}


@retry(stop=stop_after_attempt(3), wait=wait_random(min=1, max=2))
def get_tiktok_info(shared_link):
    try:
        parsed = re.findall("^https?://www.tiktok.com/[^/]+/video/(\d+)", shared_link)
        if len(parsed) == 0:
            print("剪贴板中的内容不是Tiktok分享链接")
            return {"success": False}
        video_id = parsed[0]
        print("TikTok视频ID:", video_id)
        tiktok_api_link = "https://api.tiktokv.com/aweme/v1/multi/aweme/detail/?aweme_ids=%5B{}%5D".format(video_id)  # 从TikTok官方API获取部分视频数据
        print("正在请求API链接:", tiktok_api_link)
        response = requests.get(url=tiktok_api_link, headers=download_headers).text
        result = json.loads(response)
        return {
            "success": True,
            "video_title": result["aweme_details"][0]["desc"],  # 视频标题,
            "video_url": result["aweme_details"][0]["video"]["play_addr"]["url_list"][0],  # 无水印视频链接
            "video_author": result["aweme_details"][0]["author"]["nickname"],  # 视频作者
        }
    except Exception as e:
        print("网络请求有错误")
        return {"success": False}


def download():
    info = get_tiktok_info(win.clipboard_get())
    if info["success"]:
        video_title = re.sub(r"[\/\\\:\*\?\"\<\>\|]", "", info["video_title"]).replace("\n", "")  # 删除title中的非法字符
        filename = info["video_author"] + " - " + video_title + ".mp4"
        download_url = info["video_url"]
        try:
            print("开始下载视频: ", filename)
            response = requests.get(download_url, headers=download_headers)
            data = response.content
            if data:
                file_path = os.path.join(download_dir, filename)
                with open(file_path, "wb") as f:
                    f.write(data)
                    f.close()
                    print("视频下载成功")
        except Exception as e:
            print("视频下载失败.")


win = tkinter.Tk()
win.title("Tiktok 下载器")
win.geometry("200x100")
win.iconphoto(True, tkinter.PhotoImage(file="favicon.png"))
win["background"] = "#C9C9C9"
button = tkinter.Button(win, text="下载剪贴板链接", bg="#7CCD7C", width=20, height=5, command=download).pack()
win.mainloop()
