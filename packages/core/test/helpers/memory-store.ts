/**
 * 内存 DataStore：core 测试共用的最小平台适配器。
 *
 * 与 Web 的 localStorage（`web/src/stores/local-storage-store.js`）、小程序的云数据库实现同一个
 * `DataStore` 接口，因此 core 的编排可以在没有任何平台运行时的环境里被完整验证。
 * 写入时做一次快照（这里用 Node 的 structuredClone），与真实存储「存下去就是独立一份」的行为一致。
 */
import type { DataStore } from "../../src/workflow.js";

export class MemoryStore implements DataStore {
  private collections = new Map<string, Map<string, unknown>>();

  async get(collection: string, id: string): Promise<unknown | null> {
    return this.collections.get(collection)?.get(id) ?? null;
  }

  async set(collection: string, id: string, value: unknown): Promise<void> {
    if (!this.collections.has(collection)) this.collections.set(collection, new Map());
    this.collections.get(collection)!.set(id, structuredClone(value));
  }

  async list(collection: string, filters: Record<string, unknown> = {}): Promise<unknown[]> {
    return [...(this.collections.get(collection)?.values() ?? [])].filter((doc) =>
      Object.entries(filters).every(([key, value]) => (doc as Record<string, unknown>)[key] === value),
    );
  }

  async delete(collection: string, id: string): Promise<void> {
    this.collections.get(collection)?.delete(id);
  }
}
