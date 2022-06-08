// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

function $(arg) {
    arg = arg.trim();
    if (arg.match(/^</)) {
        const template = document.createElement("template");
        template.innerHTML = arg;
        return template.content.firstChild;
    } else {
        return document.querySelector.bind(arg);
    }
}

console.log(i18n.get("Download Folder"));
const header = $("#header-area");
const footer = $("#footer-area");
const logContainer = $("#log-area");

const btnDownload = $(`<button class=".btn-download"><span>${i18n.get("Paste/Download")}</span></button>`);
const btnKeepTop = $(`<button class=".btn-download"><span>${i18n.get("Keep Top")}</span></button>`);
const btnSelectTarget = $(`<button class=".btn-download"><span>${i18n.get("Download Folder")}</span></button>`);
const statDownloading = $(`<button class=".btn-download"><span>${i18n.get("Downloading_")}</span></button>`);
const statWaiting = $(`<button class=".btn-download"><span>${i18n.get("Waiting_")}</span></button>`);
const statDownloaded = $(`<button class=".btn-download"><span>${i18n.get("Downloaded_")}</span></button>`);
const statFailed = $(`<button class=".btn-download"><span>${i18n.get("Failed_")}</span></button>`);
const btnGithub = $(`<button class=".btn-download"><span>${i18n.get("Github Source")}</span></button>`);
const txtStatus = $(`<span class=".txt-status">${i18n.get("Parsing...")}</span>`);
