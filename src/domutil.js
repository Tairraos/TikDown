function $(arg) {
    if (arg.match(/^</)) {
        const template = document.createElement("template");
        template.innerHTML = arg;
        return template.content.firstChild;
    }
    return document.querySelector(arg);
}

function iconTextButton(iconName, textKey) {
    const domStr = [
        `<button class="icon-text-btn btn-${iconName}" title="${i18n.get(textKey)}" data-i18n="title%${textKey}">`,
        `<svg class="icon ${iconName}"><use xlink:href="#icon-${iconName}"/></svg>`,
        `<span class="text" data-i18n="innerText%${textKey}">${i18n.get(textKey)}</span>`,
        `</button>`
    ].join("");
    return $(domStr);
}

function iconButton(iconName, textKey) {
    const domStr = [
        `<button class="icon-btn btn-${iconName}" title="${i18n.get(textKey)}" data-i18n="title%${textKey}">`,
        `<svg class="icon ${iconName}"><use xlink:href="#icon-${iconName}"/></svg>`,
        `</button>`
    ].join("");
    return $(domStr);
}

function iconDataStat(iconName, textKey, data) {
    const domStr = [
        `<div class="icon-data-stat stat-${iconName}" title="${i18n.get(textKey)}" data-i18n="title%${textKey}">`,
        `<svg class="icon ${iconName}"><use xlink:href="#icon-${iconName}"/></svg>`,
        `<span class="data">${data}</span>`,
        `</button>`
    ].join("");
    return $(domStr);
}
function downloadFolderButton() {
    return $(`<button class="btn-stat" title="${i18n.get("Open folder")}" data-i18n="title:Open folder">${config.target}</button>`);
}
function selectLangBox() {
    const domArr = [`<select class="select-lang" title="${i18n.get("Change language")}" data-i18n="title:Change language">`];
    i18n.langList.forEach((item) => {
        domArr.push(`<option value="${item.name}" ${item.name === i18n.lang ? "selected" : ""}>${item.local}</option>`);
    });
    domArr.push(`</select>`);
    return $(domArr.join(""));
}

function taskBox(params) {
    const domStr = [
        `<div class="task-box task-${params.videoId}">`,
        `<div class="task-thumb"><svg xmlns='http://www.w3.org/2000/svg'><use xlink:href='#icon-unknown'/></svg></div>`,
        `<div class="task-info">`,
        `<div class="task-url">${params.videoUrl}</div>`,
        `<div class="task-title"></div>`,
        `<div class="task-download">`,
        `<span class="task-size"></span>`,
        `<span class="task-processbar"><span class="task-process"></span></span>`,
        `</div></div>`,
        `<div class="task-status"></div>`,
        `</div>`
    ].join("");
    return $(domStr);
}

function setFolderStat(folder) {
    if (folder !== "") {
        dom.btnFolderText.innerText = folder;
        dom.btnFolderText.classList.remove("error");
    }
    if (!utils.existDir(dom.btnFolderText.innerText)) {
        dom.btnFolderText.classList.add("error");
    } else {
        utils.setSetting("download.folder", folder);
        printLog("You have changed the download folder.");
    }
}

function changeLanguage(lang) {
    const domList = document.querySelectorAll("[data-i18n]");
    utils.setSetting("language", lang);
    i18n.select(lang);
    domList.forEach((item) => {
        const [attr, i18nKey] = item.getAttribute("data-i18n").split("%");
        item[attr] = i18n.get(i18nKey);
    });
    printLog("You have changed the display language.");
}

function printLog(i18nKey) {
    dom.staLogText.innerText = i18n.get(i18nKey);
    clearTimeout(dom.staLogText.timer);
    dom.staLogText.timer = setTimeout(() => {
        dom.staLogText.innerText = "";
    }, 3000);
}
