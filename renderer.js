let dom = {
        root: $("#app-root"),
        header: $("#header-area"),
        footer: $("#footer-area"),
        taskLog: $("#task-area"),
        headerLeft: $("#header-area .left-area"),
        headerRight: $("#header-area .right-area"),
        footerLeft: $("#footer-area .left-area"),
        footerRight: $("#footer-area .right-area")
    },
    taskQue = {},
    config = {};

function prepareConfig() {
    config.lang = setting.lang;
    config.target = setting.target;
    config.record = Array.from(setting.record);
}

function createUI() {
    document.title = i18n.get("TikDown", utils.getVersion());

    dom.btnPaste = genIconTextButton("paste", "Paste/Download");
    dom.btnKeepTop = genIconButton("keeptop", "Keep window on top");
    dom.btnWatch = genIconButton("watch", "Start clipboard monitoring (auto paste)");
    dom.btnStopWatch = genIconButton("stopwatch", "Stop clipboard monitoring");
    dom.btnQuitTop = genIconButton("quittop", "Exit window on top mode");
    dom.btnMiniWin = genIconButton("minimize", "Mini window mode");
    dom.btnNormalWin = genIconButton("maximize", "Normal window mode");
    dom.btnFolder = genIconButton("folder", "Change download folder");
    dom.btnFolderText = genFolderTextBtn();
    dom.selectLang = genLangSelector();
    dom.btnExit = genIconButton("exit", "Exit");

    dom.btnStopWatch.classList.add("hide");
    dom.btnQuitTop.classList.add("hide");
    dom.btnNormalWin.classList.add("hide");

    dom.headerLeft.appendChild(dom.btnPaste);
    dom.headerRight.appendChild(dom.btnWatch);
    dom.headerRight.appendChild(dom.btnStopWatch);
    dom.headerRight.appendChild(dom.btnKeepTop);
    dom.headerRight.appendChild(dom.btnQuitTop);
    dom.headerRight.appendChild(dom.btnMiniWin);
    dom.headerRight.appendChild(dom.btnNormalWin);
    dom.headerRight.appendChild(dom.btnFolder);
    dom.headerRight.appendChild(dom.btnFolderText);
    dom.headerRight.appendChild(dom.selectLang);
    dom.headerRight.appendChild(dom.btnExit);

    dom.btnGithub = genIconButton("github", "Github source");
    dom.staLogText = $(`<span class="text-stat"></span>`);
    dom.statDownloading = genIconDataStat("downloading", "Downloading...", 0);
    dom.dataDownloading = dom.statDownloading.querySelector(".data");
    dom.statWaiting = genIconDataStat("waiting", "Waiting...", 0);
    dom.dataWaiting = dom.statWaiting.querySelector(".data");
    dom.statDownloaded = genIconDataStat("downloaded", "Downloaded", 0);
    dom.dataDownloaded = dom.statDownloaded.querySelector(".data");
    dom.statFailed = genIconDataStat("failed", "Failed", 0);
    dom.dataFailed = dom.statFailed.querySelector(".data");

    dom.footerLeft.appendChild(dom.btnGithub);
    dom.footerLeft.appendChild(dom.staLogText);
    dom.footerRight.appendChild(dom.statDownloading);
    dom.footerRight.appendChild(dom.statWaiting);
    dom.footerRight.appendChild(dom.statDownloaded);
    dom.footerRight.appendChild(dom.statFailed);
}

function createTaskUI(task) {
    const domtask = genTaskBox(task);
    dom.taskLog.appendChild(domtask);
    dom.taskLog.scrollTo(0, dom.taskLog.scrollHeight);
    return domtask;
}

function bindUIEvent() {
    dom.btnPaste.addEventListener("click", () => {
        manageClipboard(utils.readClipboard());
    });

    dom.btnGithub.addEventListener("click", () => {
        utils.openGithub();
    });

    dom.btnWatch.addEventListener("click", () => {
        watchClipboard(true);
        dom.btnStopWatch.classList.remove("hide");
        dom.btnWatch.classList.add("hide");
    });

    dom.btnStopWatch.addEventListener("click", () => {
        watchClipboard(false);
        dom.btnStopWatch.classList.add("hide");
        dom.btnWatch.classList.remove("hide");
    });

    dom.btnKeepTop.addEventListener("click", () => {
        utils.toggleKeepTop(true);
        dom.btnQuitTop.classList.remove("hide");
        dom.btnKeepTop.classList.add("hide");
    });

    dom.btnQuitTop.addEventListener("click", () => {
        utils.toggleKeepTop(false);
        dom.btnQuitTop.classList.add("hide");
        dom.btnKeepTop.classList.remove("hide");
    });

    dom.btnMiniWin.addEventListener("click", () => {
        dom.root.classList.add("mini");
        dom.btnMiniWin.classList.add("hide");
        dom.root.classList.remove("normal");
        dom.btnNormalWin.classList.remove("hide");
        utils.resize(166, 128);
    });

    dom.btnNormalWin.addEventListener("click", () => {
        dom.root.classList.add("normal");
        dom.btnNormalWin.classList.add("hide");
        dom.root.classList.remove("mini");
        dom.btnMiniWin.classList.remove("hide");
        utils.resize(800, 600);
    });

    dom.btnFolder.addEventListener("click", async () => {
        updateFolderTextUI(await utils.selectFolder());
    });

    dom.btnFolderText.addEventListener("click", () => {
        const target = dom.btnFolderText.innerText;
        if (utils.existDir(target)) {
            utils.openFolder(target);
        }
    });

    dom.selectLang.addEventListener("change", () => {
        updateI18nStringUI(dom.selectLang.value);
    });

    dom.btnExit.addEventListener("click", () => {
        utils.exit();
    });
}

function bindDownloadEvent() {
    Object.keys(downloadEventHandler).forEach((item) => {
        ipc.addEventListener(item, downloadEventHandler[item]);
    });
}

//start rendering
initApp().then(() => {
    prepareConfig();
    createUI();
    bindUIEvent(); //bind UI event to DOM
    bindDownloadEvent(); //bind download event to IPC
});
