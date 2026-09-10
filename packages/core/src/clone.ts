/**
 * 领域数据深拷贝（平台无关）。
 *
 * core 只依赖 ECMAScript：`structuredClone` 属于 HTML 规范而不是语言本身，
 * 微信小程序运行时并不保证提供它。领域数据（Workout、LibraryCourse、会话记录等）
 * 都是纯 JSON 结构——没有函数、类实例、Map/Set 与循环引用——所以这里用纯 JS 递归拷贝，
 * 同一份实现可以同时跑在浏览器、Node 测试与微信小程序里。
 */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => deepClone(entry)) as unknown as T;
  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(source)) copy[key] = deepClone(source[key]);
  return copy as T;
}
