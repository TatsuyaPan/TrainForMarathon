/**
 * 轻量反馈层：把「保存成功 / 出错 / 需要注意」统一成应用内消息。
 *
 * 之前这些提示用原生 window.alert，会阻塞页面、样式与主题无关，且保存后跳转时体验割裂。
 * 破坏性操作（删除课表、移除会话等）仍然用原生 confirm 二次确认，那里需要阻塞式选择。
 */
import { MessagePlugin } from "tdesign-vue-next";

/** 成功提示 */
export function notifySuccess(text) {
  MessagePlugin.success(text);
}

/** 出错提示（校验失败、保存失败等） */
export function notifyError(text) {
  MessagePlugin.error(text);
}

/** 需要用户注意但不阻断的提示（如「课表仍按旧配速」） */
export function notifyWarning(text) {
  MessagePlugin.warning(text);
}
