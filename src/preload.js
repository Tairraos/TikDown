const os = require("os");
const fs = require("fs");
const path = require("path");
const package = require(path.join(__dirname, "../package.json"));
const { contextBridge, ipcRenderer } = require("electron");

//Get I18n
const langPattern = /^[a-z]{2}_[A-Z]{2}$/;
// const defaultLang = package.defaultLang || "zh_CN";
const i18n = {
    lang: "zh_CN",
    select: (lang) => {
        if (lang.match(langPattern) && typeof i18n[lang] === "object") {
            i18n.lang = lang;
        }
    },
    get: (item, ...args) => {
        return (i18n[i18n.lang][item] || item).replace(/\{(\d+)\}/g, function (match, number) {
            return args[+number];
        });
    }
};
const root = path.join(__dirname, "i18n");
const files = fs.readdirSync(root);
files.forEach((item) => {
    const fileBase = path.basename(item, ".json");
    if (fs.statSync(path.join(root, item)).isFile() && fileBase.match(langPattern)) {
        i18n[fileBase] = require(path.join(root, item));
    }
});

const utils = {
    existDir: (dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory(),
    prepareDir: (dir) => {
        dir = dir.replace(/^~/, os.homedir());
        if (!utils.existDir(dir)) {
            if (!utils.existDir(path.dirname(dir))) {
                utils.prepareDir(path.dirname(dir));
            }
            fs.mkdirSync(dir);
        }
    }
};

window.addEventListener("DOMContentLoaded", () => {
    document.title = i18n.get("Tiktok Downloader", package.version);
});

contextBridge.exposeInMainWorld("i18n", i18n);
contextBridge.exposeInMainWorld("utils", utils);
