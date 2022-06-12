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
    taskQue = {};

function createUI() {
    document.title = i18n.get("Tiktok Downloader", utils.getVersion());

    dom.btnPaste = iconTextButton("paste", "Paste/Download");
    dom.btnKeepTop = iconButton("keeptop", "Keep Top");
    dom.btnQuitTop = iconButton("quittop", "Quit Top");
    dom.btnMiniWin = iconButton("minimize", "Mini Window");
    dom.btnNormalWin = iconButton("maximize", "Normal Window");
    dom.btnFolder = iconButton("folder", "Download Folder");
    dom.btnFolderText = $(`<button class="text-btn"></button>`);
    dom.btnExit = iconButton("exit", "Exit");

    dom.btnQuitTop.classList.add("hide");
    dom.btnNormalWin.classList.add("hide");

    dom.headerLeft.appendChild(dom.btnPaste);
    dom.headerRight.appendChild(dom.btnKeepTop);
    dom.headerRight.appendChild(dom.btnQuitTop);
    dom.headerRight.appendChild(dom.btnMiniWin);
    dom.headerRight.appendChild(dom.btnNormalWin);
    dom.headerRight.appendChild(dom.btnFolder);
    dom.headerRight.appendChild(dom.btnFolderText);
    dom.headerRight.appendChild(dom.btnExit);

    dom.btnGithub = iconButton("github", "Github Source");
    dom.staTextLog = $(`<button class="text-btn"></button>`);
    dom.statDownloading = iconDataStat("downloading", "Downloading_", 0);
    dom.statWaiting = iconDataStat("waiting", "Waiting_", 0);
    dom.statDownloaded = iconDataStat("downloaded", "Downloaded_", 0);
    dom.statFailed = iconDataStat("failed", "Failed_", 0);

    dom.footerLeft.appendChild(dom.btnGithub);
    dom.footerRight.appendChild(dom.statDownloading);
    dom.footerRight.appendChild(dom.statWaiting);
    dom.footerRight.appendChild(dom.statDownloaded);
    dom.footerRight.appendChild(dom.statFailed);
}
// const txtStatus = getIconComponent("button", "txtStatus", null, "Parsing...");
// taskLog.appendChild(txtStatus);

function bindEvent() {
    dom.btnPaste.addEventListener("click", () => {
        console.log(utils.readClipboard());
    });
    dom.btnGithub.addEventListener("click", () => {
        utils.openGithub();
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
    });

    dom.btnNormalWin.addEventListener("click", () => {
        dom.root.classList.add("normal");
        dom.btnNormalWin.classList.add("hide");
        dom.root.classList.remove("mini");
        dom.btnMiniWin.classList.remove("hide");
    });

    dom.btnFolder.addEventListener("click", async () => {
        setDownloadFolder(await utils.selectFolder());
    });
    dom.btnFolderText.addEventListener("click", async () => {
        setDownloadFolder(await utils.selectFolder());
    });

    dom.btnExit.addEventListener("click", () => {
        utils.exit();
    });
}

function setDownloadFolder(folder) {
    if (folder !== "") {
        dom.btnFolderText.innerText = folder;
        dom.btnFolderText.classList.remove("error");
    }
    if (!uril.existDir(dom.btnFolderText.innerText)) {
        dom.btnFolderText.classList.add("error");
    }
}

//start rendering
createUI();
bindEvent();
