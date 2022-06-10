
const header = $("#header-area");
const footer = $("#footer-area");
const logContainer = $("#log-area");
const btnGithub = $(".btnGithub");
$(".btnGithub").title = i18n.get("Github Source");

const btnPaste = getIconComponent("button", "icon-btn btnPaste", "paste", "Paste/Download");
const btnKeepTop = getIconComponent("button", "icon-btn btnKeepTop", "keeptop", "Keep Top");
const btnMinWin = getIconComponent("button", "icon-btn btnMinWin", "minimize", "Mini Window");
const btnSelectTarget = getIconComponent("button", "icon-btn btnSelectTarget", "folder", "Download Folder");

header.appendChild(btnPaste);
header.appendChild(btnKeepTop);
header.appendChild(btnMinWin);
header.appendChild(btnSelectTarget);

const statDownloading = getIconComponent("div", "icon-stat statDownloading", "downloading", "Downloading_", 0);
const statWaiting = getIconComponent("div", "icon-stat statWaiting", "waiting", "Waiting_", 0);
const statDownloaded = getIconComponent("div", "icon-stat statDownloaded", "downloaded", "Downloaded_", 0);
const statFailed = getIconComponent("div", "icon-stat statFailed", "failed", "Failed_", 0);

footer.appendChild(statDownloading);
footer.appendChild(statWaiting);
footer.appendChild(statDownloaded);
footer.appendChild(statFailed);

const txtStatus = getIconComponent("button", "txtStatus", null, "Parsing...");

logContainer.appendChild(txtStatus);
