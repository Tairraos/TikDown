import type { CheckState } from "./checkState";
import { clear, el } from "./dom";

export type { CheckState };
export type CheckName = "dir" | "ytdlp" | "ffmpeg";

export interface PathCheckRowDeps {
  name: CheckName;
  label: string;
  /** 行名旁的附加信息(如探测版本) */
  info: string;
  state: CheckState;
  /** 输入框内容被用户修改(state 已更新) */
  onInput: () => void;
  onVerify: () => void;
  onPickFile?: () => void;
  onClear: () => void;
}

export interface PathCheckRowHandle {
  row: HTMLElement;
  msgRow: HTMLElement;
  /** 消息行按当前 state 重绘 */
  updateMsg: () => void;
}

/**
 * 设置弹层的「手贴路径 + 检测」行(TD-FE-010):
 * 输入框可直接粘贴完整路径;检测通过(state.ok)且来源为用户时出现「清除」。
 * 状态机:empty → pending(用户输入)→ checking → ok/fail。
 */
export function buildPathCheckRow(deps: PathCheckRowDeps): PathCheckRowHandle {
  const { state: st } = deps;

  const input = el("input", {
    class: "check-input",
    placeholder: "粘贴完整路径,或点「选择…」",
    spellcheck: "false",
  }) as HTMLInputElement;
  input.value = st.value;
  input.oninput = () => {
    st.value = input.value.trim();
    st.userTouched = true;
    st.auto = false;
    st.status = st.value === "" ? "empty" : "pending";
    st.message = "";
    deps.onInput();
    updateMsg();
  };

  const checkBtn = el("button", { class: "btn tiny", text: "检测", onclick: () => deps.onVerify() });
  st.checkBtn = checkBtn;

  const ops = el("div", { class: "path-ops" }, checkBtn);
  if (deps.onPickFile) {
    const pickBtn = el("button", { class: "btn tiny ghost", text: "选择…" });
    pickBtn.onclick = () => {
      if (deps.onPickFile) deps.onPickFile();
    };
    ops.append(pickBtn);
  }
  // 清除(仅用户手动指定的已验证行;自动探测行没有可清除的设置)
  if (!st.auto && st.value !== "" && st.status === "ok") {
    ops.append(el("button", { class: "btn tiny ghost", text: "清除", onclick: () => deps.onClear() }));
  }

  const row = el(
    "div",
    { class: "path-row" },
    el(
      "div",
      { class: "path-info" },
      el("span", { class: "path-name" }, deps.label, el("span", { class: "path-ver", text: deps.info ? ` · ${deps.info}` : "" }))
    ),
    input,
    ops
  );

  const msgRow = el("div", { class: "check-msg" });

  function updateMsg() {
    clear(msgRow);
    if (st.status === "empty") return;
    const cls = st.status === "ok" ? "ok" : st.status === "fail" ? "fail" : "dim";
    const text =
      st.status === "pending"
        ? "未检测——关闭前会自动检测"
        : st.status === "checking"
          ? "检测中…"
          : st.message;
    msgRow.append(el("span", { class: `check-msg-text ${cls}`, text }));
  }
  updateMsg();

  return { row, msgRow: msgRow as HTMLElement, updateMsg };
}
