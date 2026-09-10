/**
 * 课程草稿的页面级传递（导入 / 复制 → 编辑器）。
 *
 * URL 只表达入口，不把整份草稿塞进 query；草稿保存在模块级状态里，
 * 因此刷新页面后草稿消失，编辑器会安全返回课程库并提示重新开始。
 */
let pending = null;

export function setPendingDraft(draft, mode = "create") {
  pending = { draft, mode };
}

export function peekPendingDraft() {
  return pending;
}

/** 取出并清空草稿（避免返回课程库后再次进入编辑器时复用旧草稿） */
export function takePendingDraft() {
  const value = pending;
  pending = null;
  return value;
}

export function clearPendingDraft() {
  pending = null;
}
