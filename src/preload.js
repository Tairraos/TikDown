const os = require("os");
const fs = require("fs");
const path = require("path");
const package = require(path.join(__dirname, "../package.json"));
const { contextBridge, ipcRenderer, clipboard, shell } = require("electron");

const utils = {
    //node bridge
    getVersion: () => package.version,
    openGithub: () => shell.openExternal("https://github.com/Tairraos/tiktok-downloader"),
    readClipboard: () => clipboard.readText(),
    existDir: (dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory(),

    //ipc bridge
    exit: () => ipcRenderer.invoke("exit"),
    toggleKeepTop: (toggle) => ipcRenderer.invoke("keepTop", toggle),
    selectFolder: () => ipcRenderer.invoke("selectFolder")
};

function prepareI18n(defaultLang) {
    const i18n = {
        lang: defaultLang,
        langList: [],
        select: (lang) => {
            if (lang.match(/^[a-z]{2}_[A-Z]{2}$/) && typeof i18n[lang] === "object") {
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
    files.forEach((file) => {
        const lang = path.basename(file, ".json");
        if (fs.statSync(path.join(root, file)).isFile() && lang.match(/^[a-z]{2}_[A-Z]{2}$/)) {
            langList.langList.push(lang);
            i18n[lang] = require(path.join(root, file));
        }
    });
    return i18n;
}

contextBridge.exposeInMainWorld("i18n", prepareI18n("zh_CN"));
contextBridge.exposeInMainWorld("utils", utils);
