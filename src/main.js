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

function initIPC() {
    ipcMain.handle("keepTop", (event, toggle) => {
        global.mainWindow.setAlwaysOnTop(toggle);
        return toggle;
    });

    ipcMain.handle("selectFolder", async () => {
        const result = await dialog.showOpenDialog({ properties: ["openDirectory"] }, (folder) => folder);
        return result.canceled ? "" : result.filePaths[0];
    });

    ipcMain.handle("exit", () => {
        app.quit();
    });

    ipcMain.handle("getSettingsLang", async () => {
        if (settings.hasSync("lang")) {
            return settings.getSync("lang");
        }
        settings.setSync("lang", "en_US");
        return "en_US";
    });

    ipcMain.handle("getSettingsTarget", async () => {
        if (settings.hasSync("target")) {
            return settings.getSync("target");
        }
        const target = path.join(os.homedir(), "Download");
        settings.setSync("target", target);
        return target;
    });

    ipcMain.handle("setSettingLang", (event, value) => {
        settings.setSync("lang", value);
        return value;
    });

    ipcMain.handle("setSettingTarget", (event, value) => {
        settings.setSync("target", value);
        return value;
    });
}

function initDownloadMonitor() {
    global.mainWindow.webContents.session.on("will-download", (event, item, webContents) => {
        // 无需对话框提示， 直接将文件保存到路径
        item.setSavePath("/tmp/save.pdf");

        item.on("updated", (event, state) => {
            if (state === "interrupted") {
                console.log("Download is interrupted but can be resumed");
            } else if (state === "progressing") {
                if (item.isPaused()) {
                    console.log("Download is paused");
                } else {
                    console.log(`Received bytes: ${item.getReceivedBytes()}`);
                }
            }
        });

        item.once("done", (event, state) => {
            if (state === "completed") {
                console.log("Download successfully");
            } else {
                console.log(`Download failed: ${state}`);
            }
        });
    });
}

app.whenReady().then(() => {
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

