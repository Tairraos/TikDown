const tasks = [];

function downloader(video_id) {
    downloading = True; // 开始下载
    info = get_tiktok_info(video_id);
    if (info["success"]) {
        video_title = re.sub('[/\\:*?"<>|]', "", info["video_title"]).replace("\n", ""); // 删除title中的非法字符
        filename = info["video_author"] + " - " + video_title + ".mp4";
        try {
            target_file = os.path.join(download_dir, filename);
            if (os.path.exists(target_file)) {
                log("视频文件已存在: ", target_file);
            } else {
                log("开始下载视频: ", filename);
                response = requests.get(info["video_url"], (headers = download_headers));
                open(target_file, "wb", () => {
                    f.write(response.content);
                    f.close();
                    log("视频下载成功");
                });
            }
        } catch (e) {
            log("视频下载失败.");
        }
    }
    downloading = False; // 开始下载
    manage_download_list(); // 继续进行下载列表管理
}

function manage_download_list() {
    if (!downloading && !len(download_list) > 0) {
        thread.start_new_thread(downloader, (download_list.pop(), 1)); // 没有在下载则起动一个下载线程
    }
}

function log(...args) {
    console.log(...args);
}

function parse_clipboard() {
    const clipStr = utils.readClipboard();
    const parsed = clipStr.match(/https?:\/\/www.tiktok.com\/[^/]+\/video\/(\d+)/);
    if (parsed) {
        taskManager({ videoUrl: parsed[0], videoId: parsed[1] });
    } else {
        reportError(0, "Clipboard have no valid Tiktok/Douyin URL.");
    }
}

async function taskManager(params) {
    createTask(params);
    const videoData = await parse(params.videoId);
}

function createTask(params) {
    const taskUI = creatrTaskUI(params);
}

async function parse(videoId) {
    // 通过API获取视频数据
    const apiURL = `https://api.tiktokv.com/aweme/v1/multi/aweme/detail/?aweme_ids=[${videoId}]`;
    const response = await fetch(apiURL, {
        headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
            "cache-control": "no-cache",
            pragma: "no-cache"
        },
        referrerPolicy: "strict-origin-when-cross-origin",
        method: "GET",
        mode: "cors"
    });
    const result = await response.json();
    if (result.status_code === 0) {
        return {
            success: true,
            video_title: result["aweme_details"][0]["desc"], // 视频标题,
            video_url: result["aweme_details"][0]["video"]["play_addr"]["url_list"][0], // 无水印视频链接
            video_author: result["aweme_details"][0]["author"]["nickname"], // 视频作者
            video_cover: result["aweme_details"][0]["video"]["cover"]["url_list"][0] // 封面图
        };
    }
    return { success: false, reason: status_msg };
}
