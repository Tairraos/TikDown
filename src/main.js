const os = require("os");
const path = require("path");
const settings = require("electron-settings");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");

const config = { taskStore: {} };

function createWindow() {
    config.mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, "preload.js")
        },
        icon: "resource/favicon.ico"
    });

    //open debug
    config.mainWindow.webContents.openDevTools();

    config.mainWindow.loadFile("index.html");
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

    ipcMain.handle("getSettingsLang", () => {
        return settings.getSync("lang") || "en_US";
    });

    ipcMain.handle("getSettingsTarget", () => {
        config.target = settings.getSync("target") || path.join(os.homedir(), "Download");
        return config.target;
    });

    ipcMain.handle("setSettingLang", (event, value) => {
        settings.setSync("lang", value);
    });

    ipcMain.handle("setSettingTarget", (event, value) => {
        settings.setSync("target", value);
    });

    ipcMain.handle("download", (event, data) => {
        config.taskStore[data.id] = data;
        config.mainWindow.webContents.downloadURL(data.fileurl + "#" + data.id);
    });

    ipcMain.handle("resize", (event, w, h) => {
        config.mainWindow.setSize(w, h, true);
    });
}

function initDownloadMonitor() {
    config.mainWindow.webContents.session.on("will-download", (event, item, webContents) => {
        const taskId = item.getURL().match(/(\d+)$/)[0],
            task = config.taskStore[taskId];

        item.setSavePath(path.join(config.target, task.filename));

        item.on("updated", (event, state) => {
            config.mainWindow.send("download updated", {
                id: taskId,
                received: item.getReceivedBytes(),
                size: item.getTotalBytes(),
                state
            });
        });

        item.once("done", (event, state) => {
            config.mainWindow.send("download done", { id: taskId, state });
        });
    });
}

const lockDetector = app.requestSingleInstanceLock();

if (!lockDetector) {
    app.quit();
} else {
    app.on("second-instance", () => showMainWindow());
}

app.on("ready", () => {
    createWindow();

    app.on("activate", function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    initIPC();
    initDownloadMonitor();
});

app.on("window-all-closed", function () {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
