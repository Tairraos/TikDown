const STEP_PARSING = "Parsing...";
const STEP_WAITING = "Waiting...";
const STEP_DOWNLOADING = "Downloading...";
const STEP_DOWNLOADED = "Downloaded";
const STEP_FAILED = "Failed";
const STAT_OK = "ok";
const STAT_ERROR = "error";

const taskQueue = {},
    preQueue = [],
    taskStore = {
        newTaskId: 1,
        queue: taskQueue,
        preQueue: preQueue,
        isParseBusy: false,
        isDownloadBusy: false,
        watchHandler: null,
        lastClipboard: ""
    };

function parseContent(urlStr) {
    return urlStr.match(/https?:\/\/(www\.tiktok\.com\/@[^/]+\/video\/(\d+)|www\.douyin\.com\/video\/(\d+)|v\.douyin\.com\/([^/]+)\/)/);
}

function watchClipboard(toggle) {
    if (toggle) {
        taskStore.watchHandler = setInterval(() => {
            const clipStr = utils.readClipboard();
            if (taskStore.lastClipboard !== clipStr) {
                manageClipboard(clipStr);
            }
        }, 1000);
    } else {
        clearInterval(taskStore.watchHandler);
        taskStore.watchHandler = null;
    }
}

async function parseShareId(task) {
    if (task.type === "v.douyin") {
        const parsed = parseContent((await fetchURL(task.videoUrl))["url"]);
        return parsed[3];
    }
    return task.shareId;
}

async function manageClipboard(clipStr) {
    if (taskStore.lastClipboard === clipStr) {
        printFooterLog("The same task is already in the download list.");
        flashPasteBtnUI(STAT_ERROR);
        return;
    }
    taskStore.lastClipboard = clipStr;
    preQueue.push(...clipStr.split("\n"));
    manageTask();
}

async function manageTask() {
    if (preQueue.length === 0 || taskStore.isParseBusy) {
        return;
    }

    const parsed = parseContent(preQueue.shift());
    taskStore.isParseBusy = true;
    // step 1: parse clipboard to get
    if (!parsed) {
        printFooterLog("The content of the clipboard is not a valid TikTok/Douyin URL.");
        taskStore.isParseBusy = false;
        return flashPasteBtnUI(STAT_ERROR);
    }

    const shareId = parsed[2] || parsed[3] || parsed[4];
    if ($(`.task-${shareId}`)) {
        printFooterLog("The same task is already in the download list.");
        taskStore.isParseBusy = false;
        return flashPasteBtnUI(STAT_ERROR);
    }

    const taskId = taskStore.newTaskId++,
        task = {
            taskId,
            shareId,
            type: parsed[1].replace(/((www|v)\.(tiktok|douyin)).*/, "$1"),
            videoUrl: parsed[0],
            domId: shareId
        };
    taskQueue[taskId] = task;
    task.dom = createTaskUI(task);
    printFooterLog("You have added a new download task.");
    flashPasteBtnUI(STAT_OK);

    // step 2: parse shareId to get videoId
    task.step = STEP_PARSING;
    updateTaskBoxUI(task.domId, { status: STEP_PARSING });
    task.videoId = await parseShareId(task);

    // step 3: parse videoId to get video info
    const data = await parseVideoInfo(task);
    if (data.success) {
        const title = `${data.author} - ${data.date} - ${data.title}`
                .replace(/[/\\:*?"<>|\n]/g, "")
                .replace(/&[^;]{3,5};/g, " ")
                .replace(/#[^ ]+( |$)/g, "")
                .trim(),
            filename = `${title.replace(/^(.{60}[\w]+.).*/, "$1")}.mp4`;
        task.step = STEP_WAITING;
        updateTaskBoxUI(task.domId, {
            status: STEP_WAITING,
            title: filename,
            cover: data.cover
        });
        task.filename = filename;
        task.fileurl = data.fileurl;
        task.videoCover = data.cover;
        downloadWaitingTask();
    } else {
        task.step = STEP_FAILED;
        updateTaskBoxUI(task.domId, {
            status: STEP_FAILED,
            title: data.resaon
        });
    }

    taskStore.isParseBusy = false;
    manageTask();
}

function downloadWaitingTask() {
    // step 4: download video
    if (!taskStore.isDownloadBusy) {
        const task = getWaitingTask();
        if (task) {
            utils.download({
                taskId: task.taskId,
                filename: task.filename,
                fileurl: task.fileurl
            });
            taskStore.isDownloadBusy = true;
        }
    }
}

function onDownloadUpdated(data) {
    taskQueue[data.taskId].step = STEP_DOWNLOADING;
    updateTaskBoxUI(taskQueue[data.taskId].domId, {
        status: STEP_DOWNLOADING,
        size: data.size,
        process: ((data.received / data.size) * 100).toFixed(1)
    });
}

function onDownloadCompleted(data) {
    if (data.state === "completed") {
        taskQueue[data.taskId].step = STEP_DOWNLOADED;
        updateTaskBoxUI(taskQueue[data.taskId].domId, {
            status: STEP_DOWNLOADED
        });
        config.record.push(taskQueue[data.taskId].videoId);
        utils.setSetting("record", config.record);
    } else {
        taskQueue[data.taskId].step = STEP_FAILED;
        updateTaskBoxUI(taskQueue[data.taskId].domId, {
            status: STEP_FAILED,
            title: data.state
        });
    }
    taskStore.isDownloadBusy = false;
    downloadWaitingTask();
}

function updateTaskCounter() {
    const result = {};
    for (let key in taskQueue) {
        let step = taskQueue[key].step.replace(/\.+$/, "");
        result[step] = (result[step] || 0) + 1;
    }
    taskStore.counter = result;
    return result;
}

function getWaitingTask() {
    for (let key in taskQueue) {
        if (taskQueue[key].step === STEP_WAITING) {
            return taskQueue[key];
        }
    }
}

async function parseVideoInfo(task) {
    let result, apiurl, rootInfo;
    switch (task.type) {
        case "v.douyin":
        case "www.douyin":
            apiurl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${task.videoId}`;
            result = await fetchURL(apiurl);
            if (result.status_code !== 0) {
                return { success: false, reason: result.status_msg };
            }
            rootInfo = result["item_list"][0];
            rootInfo.fileurl = (await fetchURL(rootInfo["video"]["play_addr"]["url_list"][0].replace("playwm", "play")))["url"];
            break;
        case "www.tiktok":
            apiurl = `https://api.tiktokv.com/aweme/v1/aweme/detail/?aweme_id=${task.videoId}`;
            result = await fetchURL(apiurl);
            if (result.status_code !== 0) {
                return { success: false, reason: result.status_msg };
            }
            rootInfo = result["aweme_detail"];
            rootInfo.fileurl = rootInfo["video"]["play_addr"]["url_list"][0];
            break;
        default:
            return {
                success: false,
                resaon: "The content of the clipboard is not a valid TikTok/Douyin URL."
            };
    }
    return {
        success: true,
        title: rootInfo["desc"],
        fileurl: rootInfo.fileurl,
        author: rootInfo["author"]["nickname"],
        cover: rootInfo["video"]["cover"]["url_list"][0],
        date: new Date(rootInfo.create_time * 1000).toISOString().replace(/-|T.*/g, "")
    };
}

async function fetchURL(url) {
    const response = await fetch(url, {
        headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
            "cache-control": "no-cache",
            pragma: "no-cache"
        },
        referrerPolicy: "strict-origin-when-cross-origin",
        method: "GET",
        mode: "cors"
    });

    return response.redirected ? response : await response.json();
}
