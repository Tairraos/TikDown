const os = require("os");
const path = require("path");
const settings = require("electron-settings");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");

function createWindow() {
    global.mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, "preload.js")
        },
        icon: "resource/favicon.ico"
    });

    //open debug
    mainWindow.webContents.openDevTools();

    mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
    createWindow();

    app.on("activate", function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    initIPC();
});

app.on("window-all-closed", function () {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

function initIPC() {
    ipcMain.handle("keepTop", (event, toggle) => {
        global.mainWindow.setAlwaysOnTop(toggle);
    });

    ipcMain.handle("selectFolder", async () => {
        const result = await dialog.showOpenDialog({ properties: ["openDirectory"] }, (folder) => folder);
        return result.canceled ? "" : result.filePaths[0];
    });

    ipcMain.handle("exit", () => {
        app.quit();
    });

    ipcMain.handle("getSettings", async () => {
        return await prepareSettings();
    });

    ipcMain.handle("setSetting", (event, name, value) => {
        settings.setSync(name, value);
    });
}

function prepareSettings() {
    let lang, target;

    if (settings.hasSync("language")) {
        lang = settings.getSync("language");
    } else {
        lang = "en_US";
        settings.setSync("language", lang);
    }

    if (settings.hasSync("download.folder")) {
        target = settings.getSync("download.folder");
    } else {
        target = path.join(os.homedir(), "Download");
        settings.setSync("download.folder", target);
    }
    return { lang, target };
}
