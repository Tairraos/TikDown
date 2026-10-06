import { mount } from "./app";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("TikDown: #root 挂载点缺失");

mount(root);
