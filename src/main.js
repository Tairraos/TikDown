const { app, shell, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    createWindow();

    app.on("activate", function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    initIPC();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", function () {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

function initIPC() {
    ipcMain.handle("openGithub", () => {
        shell.openExternal("https://github.com/Tairraos/tiktok-downloader");
    });

    ipcMain.handle("keepTop", (event, toggle) => {
        global.mainWindow.setAlwaysOnTop(toggle);
    });

    ipcMain.handle("exit", () => {
        app.quit();
    });
}
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
