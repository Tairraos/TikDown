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
const getText = (i18nKey) => $(`<span class="text">${i18n.get(i18nKey)}</span>`);
const getBtn = (id, iconName, i18nKey) => {
    const btn = $(`<button id="${id}"/>`);
    iconName && btn.appendChild(getSvg(iconName));
    i18nKey && btn.appendChild(getText(i18nKey, ""));
    return btn;
};

const header = $("#header-area");
const footer = $("#footer-area");
const logContainer = $("#log-area");

const btnPaste = getBtn("btnPaste", "paste", "Paste/Download");
const btnKeepTop = getBtn("btnKeepTop", "keeptop", "Keep Top");
const btnMaxWin = getBtn("btnMaxWin", "maximize", "Keep Top");
const btnMinWin = getBtn("btnMinWin", "minimize", "Keep Top");
const btnSelectTarget = getBtn("btnSelectTarget", "folder", "Download Folder");
const statDownloading = getBtn("statDownloading", "download", "Downloading_");
const statWaiting = getBtn("statWaiting", "waiting", "Waiting_");
const statDownloaded = getBtn("statDownloaded", "success", "Downloaded_");
const statFailed = getBtn("statFailed", "failed", "Failed_");
const btnGithub = getBtn("btnGithub", "github", "Github Source");
const txtStatus = getBtn("txtStatus", null, "Parsing...");

header.appendChild(btnPaste);
header.appendChild(btnKeepTop);
header.appendChild(btnSelectTarget);
footer.appendChild(btnGithub);
footer.appendChild(statDownloading);
footer.appendChild(statWaiting);
footer.appendChild(statDownloaded);
footer.appendChild(statFailed);
logContainer.appendChild(txtStatus);
