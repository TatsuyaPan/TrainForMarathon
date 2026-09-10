import { describe, expect, it } from "vitest";
import { getContentById, getContentIndex } from "../src/index.js";

describe("course content catalog", () => {
  it("contains all 23 course documents with stable navigation", () => {
    const index = getContentIndex();
    expect(index).toHaveLength(23);
    expect(new Set(index.map(({ id }) => id)).size).toBe(23);
    expect(index[0].previousId).toBeUndefined();
    expect(index.at(-1)?.nextId).toBeUndefined();
    index.forEach((entry, position) => {
      expect(entry.previousId).toBe(index[position - 1]?.id);
      expect(entry.nextId).toBe(index[position + 1]?.id);
    });
  });

  it("returns embedded Markdown without runtime filesystem access", () => {
    const document = getContentById("training-types/pace-baseline");
    expect(document.title).toBe("训练基准和训练类型划分");
    expect(document.contentVersion).toBe(1);
    expect(document.markdown).toContain("6秒规则");
    expect(document.markdown).not.toMatch(/\.\.\/.*\.md/);
    expect(getContentById("plans").markdown).toContain("content://plans/20-week");
    expect(getContentById("details").assets).toEqual([]);
    expect(getContentById("details/taper").assets[0]?.uri).toMatch(/^asset:\/\//);
    expect(() => getContentById("missing")).toThrowError(/Unknown content/);
  });

  it("returns isolated content documents", () => {
    const first = getContentById("details/taper");
    first.title = "changed";
    (first.assets[0] as { uri: string }).uri = "changed";
    expect(getContentById("details/taper").title).toBe("赛前减量");
    expect(getContentById("details/taper").assets[0].uri).toMatch(/^asset:\/\//);
  });
});
