const os = require("os");
const fs = require("fs");
const path = require("path");
const settings = require("electron-settings");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { DownloaderHelper } = require("node-downloader-helper");
const config = {};

/**
 * Add setting here
 */
const defaultSettings = {
    lang: "en_US",
    target: path.join(os.homedir(), "Downloads"),
    record: []
};

function createWindow() {
    config.mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, "preload.js")
        },
        icon: "resource/favicon.ico"
    });

    // open debug
    // config.mainWindow.webContents.openDevTools();

    // setup user-agent
    config.mainWindow.webContents.userAgent = "Mozilla/5.0 (iPad; CPU OS 5_1_1 like Mac OS X) AppleWebKit/534.46 (KHTML, like Gecko) Version/5.1 Mobile/9B206 Safari/7534.48.3";
    config.mainWindow.loadFile("index.html");
}

function getUnqueFilename(filepath, filename, n = 1) {
    if (fs.existsSync(path.join(filepath, filename + ".mp4"))) {
        filename = filename.replace(/\(\d+\)$/, "") + `(${n})`;
        return getUnqueFilename(filepath, filename, n + 1);
    }
    return filename;
}

function initIPC() {
    ipcMain.handle("keepTop", (event, toggle) => {
        config.mainWindow.setAlwaysOnTop(toggle);
    });

    ipcMain.handle("selectFolder", async () => {
        const result = await dialog.showOpenDialog({ properties: ["openDirectory"] }, (folder) => folder);
        return result.canceled ? "" : result.filePaths[0];
    });

    ipcMain.handle("exit", () => {
        app.quit();
    });

    ipcMain.handle("getSetting", (event, item) => {
        if (Object.keys(defaultSettings).includes(item)) {
            config[item] = settings.getSync(item) || defaultSettings[item];
            return config[item];
        }
    });

    ipcMain.handle("setSetting", (event, item, value) => {
        if (Object.keys(defaultSettings).includes(item)) {
            config[item] = value;
            settings.setSync(item, config[item]);
        }
    });

    ipcMain.handle("download", (event, data) => {
        const taskId = data.taskId;

        const dl = new DownloaderHelper(data.fileurl, config.target, {
            fileName: getUnqueFilename(config.target, data.filename) + ".mp4"
        });

        dl.on("end", (info) => {
            config.mainWindow.send("downloadEnd", { taskId, isSuccess: !info.incomplete, openpath: info.filePath });
        });
        dl.on("error", (info) => {
            config.mainWindow.send("downloadError", { taskId, message: info.message });
        });
        dl.on("download", (info) => {
            config.mainWindow.send("downloadStart", { taskId, size: info.totalSize, filename: info.fileName });
        });
        dl.on("progress", (info) => {
            config.mainWindow.send("downloadProgress", { taskId, progress: info.progress });
        });
        dl.start().catch((info) => {
            config.mainWindow.send("downloadError", { taskId, message: info.message });
        });
        // config.mainWindow.webContents.downloadURL(data.fileurl + "#" + data.taskId);
    });

    ipcMain.handle("resize", (event, w, h) => {
        config.mainWindow.setSize(w, h, true);
    });
}

const onlyInstance = app.requestSingleInstanceLock();
if (!onlyInstance) {
    app.quit();
}

app.on("ready", () => {
    createWindow();

    app.on("activate", function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    if (process.platform === "darwin") {
        let forceQuit = false;
        app.on("before-quit", () => {
            forceQuit = true;
        });
        config.mainWindow.on("close", (event) => {
            if (!forceQuit) {
                event.preventDefault();
                config.mainWindow.minimize();
            }
        });
    }

    initIPC();

});

app.on("second-instance", () => config.mainWindow.show());

app.on("window-all-closed", function () {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
