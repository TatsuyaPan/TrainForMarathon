/**
 * web 端 DataStore：localStorage 持久化。
 * 与微信云数据库适配器实现同一 DataStore 接口 —— 平台差异只在此收敛。
 */

const KEY_SEPARATOR = ":";

export class LocalStorageDataStore {
  constructor(prefix = "tfm") {
    this.prefix = prefix;
  }

  key(collection, id) {
    return `${this.prefix}${KEY_SEPARATOR}${collection}${KEY_SEPARATOR}${id}`;
  }

  async get(collection, id) {
    const raw = localStorage.getItem(this.key(collection, id));
    return raw ? JSON.parse(raw) : null;
  }

  async set(collection, id, value) {
    localStorage.setItem(this.key(collection, id), JSON.stringify(value));
  }

  async list(collection, filters = {}) {
    const prefix = `${this.prefix}${KEY_SEPARATOR}${collection}${KEY_SEPARATOR}`;
    const results = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      const doc = JSON.parse(localStorage.getItem(key));
      if (Object.entries(filters).every(([field, value]) => doc[field] === value)) {
        results.push(doc);
      }
    }
    return results;
  }

  async delete(collection, id) {
    localStorage.removeItem(this.key(collection, id));
  }
}
