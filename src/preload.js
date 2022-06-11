const os = require("os");
const fs = require("fs");
const path = require("path");
const package = require(path.join(__dirname, "../package.json"));
const { contextBridge, ipcRenderer, clipboard } = require("electron");

const utils = {
    getVersion: () => package.version,
    readClipboard: () => clipboard.readText(),
    toggleKeepTop: (toggle) => ipcRenderer.invoke("keepTop", toggle),
    openGithub: () => ipcRenderer.invoke("openGithub"),
    exit: () => ipcRenderer.invoke("exit"),
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

function prepareI18n(defaultLang) {
    const i18n = {
        lang: defaultLang,
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
    files.forEach((item) => {
        const fileBase = path.basename(item, ".json");
        if (fs.statSync(path.join(root, item)).isFile() && fileBase.match(/^[a-z]{2}_[A-Z]{2}$/)) {
            i18n[fileBase] = require(path.join(root, item));
        }
    });
    return i18n;
}

contextBridge.exposeInMainWorld("i18n", prepareI18n("zh_CN"));
contextBridge.exposeInMainWorld("utils", utils);
