const fs = require("fs");
const path = require("path");
const package = require(path.join(__dirname, "../package.json"));
const { contextBridge, ipcRenderer, clipboard, shell } = require("electron");

const utils = {
    //node bridge
    getVersion: () => package.version,
    openGithub: () => shell.openExternal("https://github.com/Tairraos/tiktok-downloader"),
    openFolder: (target) => shell.openPath(target),
    readClipboard: () => clipboard.readText(),
    existDir: (dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory(),
    existFile: (filepath) => fs.existsSync(filepath),

    //ipc bridge
    exit: () => ipcRenderer.invoke("exit"),
    toggleKeepTop: (toggle) => ipcRenderer.invoke("keepTop", toggle),
    selectFolder: () => ipcRenderer.invoke("selectFolder"),
    getSettingsLang: () => ipcRenderer.invoke("getSettingsLang"),
    getSettingsTarget: () => ipcRenderer.invoke("getSettingsTarget"),
    setSettingLang: (value) => ipcRenderer.invoke("setSettingLang", value),
    setSettingTarget: (value) => ipcRenderer.invoke("setSettingTarget", value)
};

function prepareI18n(lang) {
    const i18n = {
        lang: lang,
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
            i18n[lang] = require(path.join(root, file));
            i18n.langList.push({
                name: lang,
                local: i18n[lang]["language_name"]
            });
        }
    });
    return i18n;
}

async function initApp() {
    const lang = await utils.getSettingsLang(),
        target = await utils.getSettingsTarget();

    contextBridge.exposeInMainWorld("i18n", prepareI18n(lang));
    contextBridge.exposeInMainWorld("utils", utils);
    contextBridge.exposeInMainWorld("config", { lang, target });
}

contextBridge.exposeInMainWorld("initApp", initApp);
