import { mount } from "./app";
import { setLang } from "./lib/i18n";
import { applyTheme, loadTheme } from "./lib/theme";
import { loadSettings } from "./state/settings";
import "./styles.css";

// 首帧前应用语言与主题,避免挂载后闪变(TD-FE-018/019)
setLang(loadSettings().language);
applyTheme(loadTheme());

const root = document.getElementById("root");
if (!root) throw new Error("TikDown: #root 挂载点缺失");

mount(root);
