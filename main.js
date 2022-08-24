const os = require("os");
const path = require("path");
const settings = require("electron-settings");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const config = { taskStore: {} };

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
        config.taskStore[data.taskId] = data;
        config.mainWindow.webContents.downloadURL(data.fileurl + "#" + data.taskId);
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
                taskId: taskId,
                received: item.getReceivedBytes(),
                size: item.getTotalBytes(),
                state
            });
        });

        item.once("done", (event, state) => {
            config.mainWindow.send("download done", { taskId: taskId, state });
        });
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
    initDownloadMonitor();
});

app.on("second-instance", () => config.mainWindow.show());

app.on("window-all-closed", function () {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
