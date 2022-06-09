function $(arg) {
    if (arg.match(/^</)) {
        const template = document.createElement("template");
        template.innerHTML = arg;
        return template.content.firstChild;
    } else {
        return document.querySelector(arg);
    }
}

const getSvg = (iconName) => $(`<span class="icon ${iconName}"><svg><use xlink:href="#icon-${iconName}"/></svg></span>`);
const getText = (i18nKey, ...args) => $(`<span class="text">${i18n.get(i18nKey, ...args)}</span>`);
const getBtn = (id, iconName, i18nKey, ...args) => {
    const btn = $(`<button id="${id}"/>`);
    iconName && btn.appendChild(getSvg(iconName));
    i18nKey && btn.appendChild(getText(i18nKey, ...args));
    return btn;
};

const header = $("#header-area");
const footer = $("#footer-area");
const logContainer = $("#log-area");

const btnPaste = getBtn("btnPaste", "paste", "Paste/Download");
const btnKeepTop = getBtn("btnKeepTop", "keeptop", "Keep Top");
const btnMinWin = getBtn("btnMinWin", "minimize", "Mini Window");
const btnSelectTarget = getBtn("btnSelectTarget", "folder", "Download Folder");
const statDownloading = getBtn("statDownloading", "download", "Downloading_", 0);
const statWaiting = getBtn("statWaiting", "waiting", "Waiting_", 0);
const statDownloaded = getBtn("statDownloaded", "success", "Downloaded_", 0);
const statFailed = getBtn("statFailed", "failed", "Failed_", 0);
const btnGithub = getBtn("btnGithub", "github", "Github Source");
const txtStatus = getBtn("txtStatus", null, "Parsing...");

header.appendChild(btnPaste);
header.appendChild(btnKeepTop);
header.appendChild(btnMinWin);
header.appendChild(btnSelectTarget);
logContainer.appendChild(txtStatus);
footer.appendChild(btnGithub);
footer.appendChild(statDownloading);
footer.appendChild(statWaiting);
footer.appendChild(statDownloaded);
footer.appendChild(statFailed);
