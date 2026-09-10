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

/**
 * 去掉对象中值为 `undefined` 的字段（递归，纯 ECMAScript）。
 *
 * 结构编辑器在切换步骤类型后会留下 `undefined` 键（例如把配速目标改成心率目标后的
 * `paceRange`）。存储与序列化前统一清理，各端得到相同结构；与 `deepClone` 一样，
 * 同一份实现可以在浏览器、Node 与微信小程序里共用。
 */
export function stripUndefinedFields<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => stripUndefinedFields(entry)) as unknown as T;
  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const entry = source[key];
    if (entry === undefined) continue;
    copy[key] = stripUndefinedFields(entry);
  }
  return copy as T;
}
