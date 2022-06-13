const STEP_PARSING = "Parsing...";
const STEP_WAITING = "Waiting...";
const STEP_DOWNLOADING = "Downloading...";
const STEP_DOWNLOADED = "Downloaded";
const STEP_FAILED = "Failed";
const STAT_OK = "ok";
const STAT_ERROR = "error";

const task = { lastId: 1, list: {} };

function pasteContent() {
    const clipStr = utils.readClipboard();
    const parsed = clipStr.match(/https?:\/\/www.tiktok.com\/[^/]+\/video\/(\d+)/);
    if (parsed) {
        if ($(`.task-${parsed[1]}`)) {
            printLog("The same task is already available in the download list.");
            flashPasteBtn(STAT_ERROR);
        } else {
            taskManager({ videoUrl: parsed[0], videoId: parsed[1] });
            printLog("You have added a new download task.");
            flashPasteBtn(STAT_OK);
        }
    } else {
        printLog("The content in the clipboard is not a valid Tiktok/Douyin URL.");
        flashPasteBtn(STAT_ERROR);
    }
}

async function taskManager(params) {
    const id = createTask(params);
    updateTask(id, { status: STEP_PARSING });
    const data = await parse(params.videoId);
    if (data.success) {
        const title = `${data.title.replace(/[/\\:*?"<>|\n]/g, "")}`.replace(/&[^;]{3,5};/g, " "),
            filename = `${data.author} - ${title.replace(/^(.{50}[\w]+.).*/, "$1")} - ${id}.mp4`;
        task.list[id].filename = filename;
        task.list[id].fileurl = data.fileUrl;
        task.list[id].videoCover = data.cover;
        task.list[id].step = STEP_WAITING;
        updateTask(id, { status: STEP_WAITING, title: filename, thumb: data.cover });
        // updateTask(id, { status: STEP_DOWNLOADING });
        // updateTask(id, { status: STEP_DOWNLOADED });
    } else {
        task.list[id].step = STEP_FAILED;
        updateTask(id, { status: STEP_FAILED, title: data.resaon });
    }
}

function createTask(params) {
    const dom = createTaskUI(params);
    task.list[task.lastId] = { ...params, dom, step: STEP_PARSING, isRunning: true };
    return task.lastId++;
}

async function parse(videoId) {
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
            title: result["aweme_details"][0]["desc"],
            fileUrl: result["aweme_details"][0]["video"]["play_addr"]["url_list"][0],
            author: result["aweme_details"][0]["author"]["nickname"],
            cover: result["aweme_details"][0]["video"]["cover"]["url_list"][0]
        };
    }
    return { success: false, reason: status_msg };
}
