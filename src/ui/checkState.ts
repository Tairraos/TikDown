/** 「手贴路径 + 检测」行的共享状态(TD-FE-010)。 */
export type CheckState = {
  /** 输入框当前值(空 = 自动模式) */
  value: string;
  /** empty:无值;pending:有值未验证;checking:检测中;ok/fail:已验证 */
  status: "empty" | "pending" | "checking" | "ok" | "fail";
  message: string;
  /** 当前展示值来自自动探测(非用户输入):不参与关闭门禁、不写设置、无清除按钮 */
  auto: boolean;
  /** 用户编辑过输入框(此后不再被自动探测覆盖,直到点「清除」) */
  userTouched: boolean;
  /** 该行的「检测」按钮(verify 中禁用,防重复点击) */
  checkBtn?: HTMLButtonElement;
};

export function initCheckState(value: string): CheckState {
  return { value, status: value === "" ? "empty" : "ok", message: "", auto: false, userTouched: value !== "" };
}
