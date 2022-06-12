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
        `<button class="icon-text-btn btn-${iconName}" title="${i18n.get(textKey)}">`,
        `<svg class="icon ${iconName}"><use xlink:href="#icon-${iconName}"/></svg>`,
        `<span class="text">${i18n.get(textKey)}</span>`,
        `</button>`
    ].join("");
    return $(domStr);
}

function iconButton(iconName, textKey) {
    const domStr = [
        `<button class="icon-btn btn-${iconName}" title="${i18n.get(textKey)}">`,
        `<svg class="icon ${iconName}"><use xlink:href="#icon-${iconName}"/></svg>`,
        `</button>`
    ].join("");
    return $(domStr);
}

function iconDataStat(iconName, textKey, data) {
    const domStr = [
        `<div class="icon-data-stat stat-${iconName}">`,
        `<svg class="icon ${iconName}"><use xlink:href="#icon-${iconName}"/></svg>`,
        `<span class="text">${i18n.get(textKey)}</span>`,
        `<span class="data">${data}</span>`,
        `</button>`
    ].join("");
    return $(domStr);
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
        dom.statFolderText.innerText = folder;
        dom.statFolderText.classList.remove("error");
    }
    if (!utils.existDir(dom.statFolderText.innerText)) {
        dom.statFolderText.classList.add("error");
    }
}

function setLogStat(text) {
    dom.staLogText.innerText = text;
    clearTimeout(dom.staLogText.timer);
    dom.staLogText.timer = setTimeout(() => {
        dom.staLogText.innerText = "";
    }, 3000);
}
