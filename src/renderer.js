let dom = {
        root: $("#app-root"),
        header: $("#header-area"),
        footer: $("#footer-area"),
        taskLog: $("#task-area"),
        btnGithub: $(".btn-github")
    },
    taskQue = {};

function createUI() {
    document.title = i18n.get("Tiktok Downloader", utils.getVersion());
    dom.btnGithub.title = i18n.get("Github Source");

    dom.btnPaste = getIconComponent("button", "btn", "paste", "Paste/Download");
    dom.btnKeepTop = getIconComponent("button", "btn", "keeptop", "Keep Top");
    dom.btnQuitTop = getIconComponent("button", "btn", "quittop", "Quit Top");
    dom.btnMiniWin = getIconComponent("button", "btn", "minimize", "Mini Window");
    dom.btnNormalWin = getIconComponent("button", "btn", "maximize", "Normal Window");
    dom.btnSelectTarget = getIconComponent("button", "btn", "folder", "Download Folder");
    dom.btnExit = getIconComponent("button", "btn", "exit", "Exit");

    dom.btnQuitTop.classList.add("hide");
    dom.btnNormalWin.classList.add("hide");

    dom.header.appendChild(dom.btnPaste);
    dom.header.appendChild(dom.btnKeepTop);
    dom.header.appendChild(dom.btnQuitTop);
    dom.header.appendChild(dom.btnMiniWin);
    dom.header.appendChild(dom.btnNormalWin);
    dom.header.appendChild(dom.btnSelectTarget);
    dom.header.appendChild(dom.btnExit);

    dom.statDownloading = getIconComponent("div", "stat", "downloading", "Downloading_", 0);
    dom.statWaiting = getIconComponent("div", "stat", "waiting", "Waiting_", 0);
    dom.statDownloaded = getIconComponent("div", "stat", "downloaded", "Downloaded_", 0);
    dom.statFailed = getIconComponent("div", "stat", "failed", "Failed_", 0);
    dom.footer.appendChild(dom.statDownloading);
    dom.footer.appendChild(dom.statWaiting);
    dom.footer.appendChild(dom.statDownloaded);
    dom.footer.appendChild(dom.statFailed);
}
// const txtStatus = getIconComponent("button", "txtStatus", null, "Parsing...");
// taskLog.appendChild(txtStatus);

function bindEvent() {
    dom.btnPaste.addEventListener("click", () => {

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

    dom.btnExit.addEventListener("click", () => {
        utils.exit();
    });
}

//start rendering
createUI();
bindEvent();
