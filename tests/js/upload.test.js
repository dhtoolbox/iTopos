import { describe, expect, it } from "vitest";

import { parseUploadMatrix, parseUploadSheets, truncateFilename } from "../../static/js/widgets/upload.js";

describe("parseUploadMatrix", () => {
  it("recognizes grouping from the group header", () => {
    const result = parseUploadMatrix([
      ["id", "group"],
      ["993", "A"],
      ["993", "B"],
    ]);

    expect(result.groupingEnabled).toBe(true);

    expect(result.rows).toHaveLength(2);

    expect([...result.groups]).toEqual(["A", "B"]);
  });

  it("does not enable grouping for headerless input", () => {
    const result = parseUploadMatrix([["993"]]);

    expect(result.groupingEnabled).toBe(false);
  });

  it("detects duplicate IDs", () => {
    const result = parseUploadMatrix([
      ["id", "group"],
      ["993", "A"],
      ["993", "B"],
    ]);

    expect(result.duplicates.duplicateIDs).toHaveLength(1);
  });

  it("rejects empty input", () => {
    expect(() => parseUploadMatrix([])).toThrow("completely empty");
  });
});



describe("parseUploadSheets", () => {
  it("combines worksheets with independently detected headers", () => {
    const result = parseUploadSheets([
      { name: "Cities", matrix: [["pleiades_id", "group"], ["579885", "A"]] },
      { name: "Ports", matrix: [["id", "group"], ["570182", "B"]] },
    ]);

    expect(result.rows.map((row) => row.id)).toEqual(["579885", "570182"]);
    expect([...result.groups]).toEqual(["A", "B"]);
    expect(result.groupingEnabled).toBe(true);
  });

  it("combines headerless and headed worksheets", () => {
    const result = parseUploadSheets([
      { name: "Headerless", matrix: [["579885"], ["570182"]] },
      { name: "Headed", matrix: [["pleiades_id"], ["570685"]] },
    ]);

    expect(result.rows.map((row) => row.id)).toEqual(["579885", "570182", "570685"]);
  });

  it("detects duplicate IDs and groups across worksheets", () => {
    const result = parseUploadSheets([
      { name: "A", matrix: [["id", "group"], ["993", "A"]] },
      { name: "B", matrix: [["id", "group"], ["993", "B"]] },
    ]);

    expect(result.duplicates.duplicateIDs).toHaveLength(1);
    expect([...result.groups]).toEqual(["A", "B"]);
  });
});

describe("truncateFilename", () => {
  it("keeps short filenames unchanged", () => {
    expect(truncateFilename("places.xlsx")).toBe("places.xlsx");
  });

  it("truncates long filenames while preserving the extension", () => {
    const result = truncateFilename("pleiades-sites-for-eastern-mediterranean.xlsx", 30);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toMatch(/…\.xlsx$/);
  });
});
