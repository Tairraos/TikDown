function $(arg) {
    if (arg.match(/^</)) {
        const template = document.createElement("template");
        template.innerHTML = arg;
        return template.content.firstChild;
    }
    return document.querySelector(arg);
}

function genIconTextButton(iconName, textKey) {
    const domStr = [
        `<button class="icon-text-btn btn-${iconName}" title="${i18n.get(textKey)}" data-i18n="title%${textKey}">`,
        `<svg class="icon ${iconName}"><use xlink:href="#icon-${iconName}"/></svg>`,
        `<span class="text" data-i18n="innerText%${textKey}">${i18n.get(textKey)}</span>`,
        `</button>`
    ].join("");
    return $(domStr);
}

function genIconButton(iconName, textKey) {
    const domStr = [
        `<button class="icon-btn btn-${iconName}" title="${i18n.get(textKey)}" data-i18n="title%${textKey}">`,
        `<svg class="icon ${iconName}"><use xlink:href="#icon-${iconName}"/></svg>`,
        `</button>`
    ].join("");
    return $(domStr);
}

function genIconDataStat(iconName, textKey, data) {
    const domStr = [
        `<div class="icon-data-stat stat-${iconName}" title="${i18n.get(textKey)}" data-i18n="title%${textKey}">`,
        `<svg class="icon ${iconName}"><use xlink:href="#icon-${iconName}"/></svg>`,
        `<span class="data">${data}</span>`,
        `</button>`
    ].join("");
    return $(domStr);
}
function genFolderTextBtn() {
    return $(`<button class="btn-stat" title="${i18n.get("Open folder")}" data-i18n="title%Open folder">${config.target}</button>`);
}
function genLangSelector() {
    const domArr = [`<select class="select-lang" title="${i18n.get("Change language")}" data-i18n="title%Change language">`];
    i18n.langList.forEach((item) => {
        domArr.push(`<option value="${item.name}" ${item.name === i18n.lang ? "selected" : ""}>${item.local}</option>`);
    });
    domArr.push(`</select>`);
    return $(domArr.join(""));
}

function genTaskBox(task) {
    const domStr = [
        `<div class="task-box task-${task.domId}">`,
        `<div class="task-thumb"><div class="task-cover"><svg xmlns='http://www.w3.org/2000/svg'><use xlink:href='#icon-unknown'/></svg></div></div>`,
        `<div class="task-info">`,
        `<div class="task-url">${task.videoUrl}</div>`,
        `<div class="task-title"></div>`,
        `<div class="task-download">`,
        `<span class="task-size"></span>`,
        `<span class="task-progressbar hide"><span class="task-progress"></span></span>`,
        `</div></div>`,
        `<div class="task-status"></div>`,
        `</div>`
    ].join("");
    return $(domStr);
}

function flashPasteBtnUI(type) {
    const extClass = `border-flash-${type}`;
    dom.btnPaste.classList.add(extClass);
    setTimeout(() => dom.btnPaste.classList.remove(extClass), 1000);
}

function updateTaskBoxUI(domId, data) {
    const container = `.task-${domId}`;
    data.cover && ($(`${container} .task-cover`).innerHTML = `<img src="${data.cover}" />`);
    data.url && ($(`${container} .task-url`).innerText = data.url);
    data.title && ($(`${container} .task-title`).innerText = i18n.get(data.title));
    if (data.size) {
        $(`${container} .task-size`).innerText = (data.size / 1024).toFixed(1).replace(/\B(?=(?:\d{3})+\b)/g, ",") + "KB";
    }
    if (data.status) {
        $(`${container}`).className = `task-box task-${domId} ${data.status.toLowerCase().replace(/\.+$/, "")}`;
        $(`${container} .task-status`).innerText = i18n.get(data.status);
        $(`${container} .task-status`).setAttribute("data-i18n", `innerText%${data.status}`);
    }
    if (data.progress) {
        $(`${container} .task-progressbar`).classList.remove("hide");
        $(`${container} .task-progress`).style.width = `${+data.progress * 2}px`;
    }
    updateFooterStatUI();
}

function updateFooterStatUI() {
    const counter = updateTaskCounter();
    dom.dataDownloading.innerText = counter.Downloading || 0;
    dom.dataWaiting.innerText = (counter.Waiting || 0) + (counter.Parsing || 0);
    dom.dataDownloaded.innerText = counter.Downloaded || 0;
    dom.dataFailed.innerText = counter.Failed || 0;
}

function updateFolderTextUI(folder) {
    if (folder !== "") {
        dom.btnFolderText.innerText = folder;
        dom.btnFolderText.classList.remove("error");
    }
    if (!utils.existDir(dom.btnFolderText.innerText)) {
        dom.btnFolderText.classList.add("error");
    } else {
        config.target = folder;
        utils.setSetting("target", folder);
        printFooterLog("You have changed the download folder.");
    }
}

function updateI18nStringUI(lang) {
    const domList = document.querySelectorAll("[data-i18n]");
    config.lang = lang;
    utils.setSetting("lang", lang);
    i18n.select(lang);
    domList.forEach((item) => {
        const [attr, i18nKey] = item.getAttribute("data-i18n").split("%");
        item[attr] = i18n.get(i18nKey);
    });
    document.title = i18n.get("TikDown", utils.getVersion());
    printFooterLog("You have changed the display language.");
}

function printFooterLog(i18nKey) {
    dom.staLogText.innerText = i18n.get(i18nKey);
    clearTimeout(dom.staLogText.timer);
    dom.staLogText.timer = setTimeout(() => {
        dom.staLogText.innerText = "";
    }, 8000);
}
