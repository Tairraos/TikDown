let conf = {
    header: $("#header-area"),
    footer: $("#footer-area"),
    logContainer: $("#log-area"),
    btnGithub: $(".btnGithub"),
    btnPaste: getIconComponent("button", "icon-btn btnPaste", "paste", "Paste/Download"),
    btnKeepTop: getIconComponent("button", "icon-btn btnKeepTop", "keeptop", "Keep Top"),
    btnMinWin: getIconComponent("button", "icon-btn btnMinWin", "minimize", "Mini Window"),
    btnSelectTarget: getIconComponent("button", "icon-btn btnSelectTarget", "folder", "Download Folder"),
    btnExit: getIconComponent("button", "icon-btn btnExit", "exit", "Exit"),
    statDownloading: getIconComponent("div", "icon-stat statDownloading", "downloading", "Downloading_", 0),
    statWaiting: getIconComponent("div", "icon-stat statWaiting", "waiting", "Waiting_", 0),
    statDownloaded: getIconComponent("div", "icon-stat statDownloaded", "downloaded", "Downloaded_", 0),
    statFailed: getIconComponent("div", "icon-stat statFailed", "failed", "Failed_", 0),
    historyList: [],
    keepTop: false
};

buildUI();
bindEvent();

function buildUI() {
    conf.header.appendChild(conf.btnPaste);
    conf.header.appendChild(conf.btnKeepTop);
    conf.header.appendChild(conf.btnMinWin);
    conf.header.appendChild(conf.btnSelectTarget);
    conf.header.appendChild(conf.btnExit);

    conf.footer.appendChild(conf.statDownloading);
    conf.footer.appendChild(conf.statWaiting);
    conf.footer.appendChild(conf.statDownloaded);
    conf.footer.appendChild(conf.statFailed);
    conf.btnGithub.title = i18n.get("Github Source");
}
// const txtStatus = getIconComponent("button", "txtStatus", null, "Parsing...");
// logContainer.appendChild(txtStatus);

function bindEvent() {
    conf.btnGithub.addEventListener("click", () => {
        utils.openGithub();
    });

    conf.btnKeepTop.addEventListener("click", () => {
        conf.keepTop = !conf.keepTop;
        utils.toggleKeepTop(conf.keepTop);
    });

    conf.btnExit.addEventListener("click", () => {
        utils.exit();
    });
}
