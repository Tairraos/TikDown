const STEP_PARSING = "Parsing...";
const STEP_WAITING = "Waiting...";
const STEP_DOWNLOADING = "Downloading...";
const STEP_DOWNLOADED = "Downloaded";
const STEP_FAILED = "Failed";
const STAT_OK = "ok";
const STAT_ERROR = "error";

const taskStore = { newTaskId: 1, queue: {}, isBusy: false };

function pasteContent() {
    const clipStr = utils.readClipboard();
    const parsed = clipStr.match(/https?:\/\/www.tiktok.com\/[^/]+\/video\/(\d+)/);
    if (parsed) {
        if ($(`.task-${parsed[1]}`)) {
            printFooterLog("The same task is already available in the download list.");
            flashPasteBtnUI(STAT_ERROR);
        } else {
            taskManager({ videoUrl: parsed[0], videoId: parsed[1] });
            printFooterLog("You have added a new download task.");
            flashPasteBtnUI(STAT_OK);
        }
    } else {
        printFooterLog("The content in the clipboard is not a valid Tiktok/Douyin URL.");
        flashPasteBtnUI(STAT_ERROR);
    }
}

async function taskManager(params) {
    const id = createTask(params);
    updateTaskBoxUI(taskStore.queue[id].videoId, { status: STEP_PARSING });
    const data = await fetchVideoInfo(params.videoId);
    if (data.success) {
        const title = `${data.author} - ${data.title}`.replace(/[/\\:*?"<>|\n]/g, "").replace(/&[^;]{3,5};/g, " "),
            filename = `${title.replace(/^(.{60}[\w]+.).*/, "$1")} - ${id}.mp4`;
        taskStore.queue[id].step = STEP_WAITING;
        updateTaskBoxUI(taskStore.queue[id].videoId, { status: STEP_WAITING, title: filename, cover: data.cover });
        taskStore.queue[id].filename = filename;
        taskStore.queue[id].fileurl = data.fileurl;
        taskStore.queue[id].videoCover = data.cover;
        downloadWaitingTask();
    } else {
        taskStore.queue[id].step = STEP_FAILED;
        updateTaskBoxUI(taskStore.queue[id].videoId, { status: STEP_FAILED, title: data.resaon });
    }
}

function downloadWaitingTask() {
    if (!taskStore.isBusy) {
        const task = getWaitingTask();
        if (task) {
            utils.download({ id: task.id, filename: task.filename, fileurl: task.fileurl });
            taskStore.isBusy = true;
        }
    }
}

function onDownloadUpdated(data) {
    taskStore.queue[data.id].step = STEP_DOWNLOADING;
    updateTaskBoxUI(taskStore.queue[data.id].videoId, { status: STEP_DOWNLOADING, size: data.size, process: ((data.received / data.size) * 100).toFixed(1) });
}

function onDownloadCompleted(data) {
    if (data.state === "completed") {
        taskStore.queue[data.id].step = STEP_DOWNLOADED;
        updateTaskBoxUI(taskStore.queue[data.id].videoId, { status: STEP_DOWNLOADED });
    } else {
        taskStore.queue[data.id].step = STEP_FAILED;
        updateTaskBoxUI(taskStore.queue[data.id].videoId, { status: STEP_FAILED, title: data.state });
    }
    taskStore.isBusy = false;
    downloadWaitingTask();
}

function createTask(params) {
    const dom = createTaskUI(params);
    taskStore.queue[taskStore.newTaskId] = { id: taskStore.newTaskId, ...params, dom, step: STEP_PARSING };
    return taskStore.newTaskId++;
}

function updateTaskCounter() {
    let result = {};
    for (let key in taskStore.queue) {
        let step = taskStore.queue[key].step.replace(/\.+$/, "");
        result[step] = (result[step] || 0) + 1;
    }
    taskStore.counter = result;
    return result;
}

function getWaitingTask() {
    for (let key in taskStore.queue) {
        if (taskStore.queue[key].step === STEP_WAITING) {
            return taskStore.queue[key];
        }
    }
}

async function fetchVideoInfo(videoId) {
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
            fileurl: result["aweme_details"][0]["video"]["play_addr"]["url_list"][0],
            author: result["aweme_details"][0]["author"]["nickname"],
            cover: result["aweme_details"][0]["video"]["cover"]["url_list"][0]
        };
    }
    return { success: false, reason: status_msg };
}
