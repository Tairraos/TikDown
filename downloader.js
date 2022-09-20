const downloadQueue = {}, //parsed task, waiting for download, can be cancelled
    parseQueue = [], //pasted string, waitting to parse
    taskStore = {
        newTaskId: 1,
        downloadQueue,
        parseQueue,
        isParseBusy: false,
        isDownloadBusy: false,
        watchHandler: null,
        lastClipboard: ""
    };

function parseContent(urlStr) {
    let parsed = urlStr.match(
        /https?:\/\/(www\.tiktok\.com\/@[^/]+\/video\/(\d+)|vm\.tiktok\.com\/([^/]+)\/|www\.douyin\.com\/video\/(\d+)|v\.douyin\.com\/([^/]+)\/)/
    );

    return parsed
        ? { videoUrl: parsed[0], type: parsed[1].replace(/((www|v|vm)\.(tiktok|douyin)).*/, "$1"), parsedId: parsed.slice(2).filter((n) => n)[0] }
        : null;
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

async function parseVideoId(task) {
    if (task.type === "v.douyin" || task.type === "vm.tiktok") {
        let parsed = parseContent((await fetchURL(task.videoUrl))["url"]);
        return parsed.parsedId;
    }
    return task.parsedId;
}

async function manageClipboard(clipStr) {
    if (taskStore.lastClipboard === clipStr) {
        printFooterLog("The same task is already in the download list.");
        flashPasteBtnUI(STATE_ERROR);
        return;
    }
    taskStore.lastClipboard = clipStr;
    parseQueue.push(...clipStr.split("\n"));
    manageTask();
}

async function manageTask() {
    if (parseQueue.length === 0 || taskStore.isParseBusy) {
        return;
    }

    const parsed = parseContent(parseQueue.shift());
    taskStore.isParseBusy = true;
    // step 1: parse clipboard to get
    if (!parsed) {
        printFooterLog("The content of the clipboard is not a valid TikTok/Douyin URL.");
        taskStore.isParseBusy = false;
        return flashPasteBtnUI(STATE_ERROR);
    }

    const parsedId = parsed.parsedId;
    if ($(`.task-${parsed.parsedId}`)) {
        printFooterLog("The same task is already in the download list.");
        taskStore.isParseBusy = false;
        return flashPasteBtnUI(STATE_ERROR);
    }

    const taskId = taskStore.newTaskId++,
        task = {
            taskId,
            videoUrl: parsed.videoUrl,
            type: parsed.type,
            parsedId: parsed.parsedId,
            domId: parsedId
        };
    downloadQueue[taskId] = task;
    task.dom = createTaskUI(task);
    printFooterLog("You have added a new download task.");
    flashPasteBtnUI(STATE_OK);

    // step 2: parse parsedId to get videoId
    task.step = STATE_PARSING;
    updateTaskBoxUI(task.domId, { status: STATE_PARSING });
    task.videoId = await parseVideoId(task);

    // step 3: parse videoId to get video info
    const data = await parseVideoInfo(task);
    if (data.success) {
        const title = data.title
                .replace(/[/\|\n*"':<>()[\]{}.?!‘“’”：（）［］｛｝。？！]/g, " ") //replace invalid chars to space
                .replace(/\s+/g, " ") //merge multi space as one
                .replace(/&[^;]{3,5};/g, " ") //remove html entities
                .replace(/#[^ ]+( |$)/g, "") //remove #tags
                .trim()
                .replace(/^(.{60}[\w]+.).*/, "$1") //truncate title to 60 chars + last word
                .replace(/^(.{80}).*/, "$1"), //truncate title to 80 chars
            filename = `${data.author} - ${data.date} - ${title || i18n.get("untitled")}`;
        task.step = STATE_WAITING;
        updateTaskBoxUI(task.domId, {
            status: STATE_WAITING,
            title: filename,
            cover: data.cover
        });
        task.filename = filename;
        task.fileurl = data.fileurl;
        task.videoCover = data.cover;
        downloadWaitingTask();
    } else {
        task.step = STATE_FAILED;
        updateTaskBoxUI(task.domId, {
            status: STATE_FAILED,
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

function updateTaskCounter() {
    const result = {};
    for (let key in downloadQueue) {
        let step = downloadQueue[key].step.replace(/\.+$/, "");
        result[step] = (result[step] || 0) + 1;
    }
    taskStore.counter = result;
    return result;
}

function getWaitingTask() {
    for (let key in downloadQueue) {
        if (downloadQueue[key].step === STATE_WAITING) {
            return downloadQueue[key];
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
        case "vm.tiktok":
        case "www.tiktok":
            apiurl = `https://api-h2.tiktokv.com/aweme/v1/feed/?version_code=2613&aweme_id=${task.videoId}&device_type=iPad`;
            result = await fetchURL(apiurl);
            if (result.status_code !== 0) {
                return { success: false, reason: result.status_msg };
            }
            rootInfo = result["aweme_list"][0];
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
    let headers = new Headers();
    headers.set("Referer", "no-referrer");
    let requestOptions = {
        method: "POST",
        headers: headers,
        redirect: "follow"
    };
    let response = await fetch(url, requestOptions);
    return response.redirected ? response : await response.json();
}

/**
 * Put download event handler here, will be bind to IPC in renderer.js
 */
const downloadEventHandler = {
    downloadStart: function (data) {
        downloadQueue[data.taskId].step = STATE_DOWNLOADING;
        updateTaskBoxUI(downloadQueue[data.taskId].domId, {
            status: STATE_DOWNLOADING,
            title: data.filename,
            size: data.size
        });
        downloadQueue[data.taskId].filename = data.filename;
    },

    downloadProgress: function (data) {
        downloadQueue[data.taskId].step = STATE_DOWNLOADING;
        updateTaskBoxUI(downloadQueue[data.taskId].domId, {
            status: STATE_DOWNLOADING,
            progress: data.progress
        });
    },

    downloadError: function (data) {
        downloadQueue[data.taskId].step = STATE_FAILED;
        updateTaskBoxUI(downloadQueue[data.taskId].domId, {
            status: STATE_FAILED,
            title: data.message
        });
    },

    downloadEnd: function (data) {
        if (data.isSuccess) {
            downloadQueue[data.taskId].step = STATE_DOWNLOADED;
            updateTaskBoxUI(downloadQueue[data.taskId].domId, {
                status: STATE_DOWNLOADED,
                openpath: data.openpath
            });
            config.record.push(downloadQueue[data.taskId].videoId);
            utils.setSetting("record", config.record);
        } else {
            onDownloadError(data);
        }
        taskStore.isDownloadBusy = false;
        downloadWaitingTask();
    }
};
