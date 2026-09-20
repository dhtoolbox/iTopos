import { describe, expect, it } from "vitest";
import {
  buildBrowseResults,
  formatCoordinates,
  matchesSelectedTypes,
  searchPleiadesRecords,
  suggestPleiadesIds,
} from "../../static/js/widgets/pleiades-search.js";

const RECORDS = [
  ["993", "Gallia", 46.36, 1.67, [0]],
  ["1993", "Not Gallia", 40, 2, [1]],
  ["99301", "X Place", 41, 3, [1]],
  ["963101052", "Fort at Great Wall of Gorgan", 37.484, 55.50946, [1, 2]],
  ["963101068", "Fort at Great Wall of Gorgan", 37.13841, 54.23228, [1]],
  ["579885", "Athenae", 37.97, 23.72, [0]],
];

describe("searchPleiadesRecords", () => {
  it("returns every duplicate-title record", () => {
    expect(searchPleiadesRecords(RECORDS, "great wall")).toHaveLength(2);
  });

  it("searches numeric queries by ID prefix rather than substring", () => {
    expect(searchPleiadesRecords(RECORDS, "993").map((row) => row[0])).toEqual(["993", "99301"]);
  });

  it("searches titles case-insensitively", () => {
    expect(searchPleiadesRecords(RECORDS, "ATHEN").map((row) => row[0])).toEqual(["579885"]);
  });
});

describe("suggestPleiadesIds", () => {
  it("suggests IDs beginning with the entered digits", () => {
    expect(suggestPleiadesIds(RECORDS, "993").map((row) => row[0])).toEqual(["993", "99301"]);
  });

  it("does not suggest IDs that only contain the digits later", () => {
    expect(suggestPleiadesIds(RECORDS, "993").map((row) => row[0])).not.toContain("1993");
  });
});

describe("place-type relationships", () => {
  it("matches any selected type with OR", () => {
    expect(matchesSelectedTypes([1], new Set([1, 2]), "or")).toBe(true);
  });

  it("requires every selected type with AND", () => {
    expect(matchesSelectedTypes([1], new Set([1, 2]), "and")).toBe(false);
    expect(matchesSelectedTypes([1, 2], new Set([1, 2]), "and")).toBe(true);
  });
});

describe("buildBrowseResults", () => {
  it("adds independently selected IDs and names", () => {
    const result = buildBrowseResults(RECORDS, {
      selectedIds: new Set(["993"]),
      selectedNames: new Set(["Athenae"]),
    });
    expect(result.map((row) => row[0])).toEqual(["993", "579885"]);
  });

  it("adds place-type matches when narrowing is off", () => {
    const result = buildBrowseResults(RECORDS, {
      selectedIds: new Set(["993"]),
      selectedTypeIndexes: new Set([2]),
      narrowByTypes: false,
    });
    expect(result.map((row) => row[0])).toEqual(["993", "963101052"]);
  });

  it("uses place types to narrow ID/name results when requested", () => {
    const result = buildBrowseResults(RECORDS, {
      selectedNames: new Set(["Fort at Great Wall of Gorgan"]),
      selectedTypeIndexes: new Set([2]),
      narrowByTypes: true,
    });
    expect(result.map((row) => row[0])).toEqual(["963101052"]);
  });

  it("can browse by place type alone", () => {
    const result = buildBrowseResults(RECORDS, {
      selectedTypeIndexes: new Set([1, 2]),
      typeRelationship: "and",
    });
    expect(result.map((row) => row[0])).toEqual(["963101052"]);
  });
});

describe("formatCoordinates", () => {
  it("formats friendly hemispheres", () => {
    expect(formatCoordinates(-33.9249, 18.4241)).toBe("33.9249° S, 18.4241° E");
  });

  it("labels missing coordinates as unlocated", () => {
    expect(formatCoordinates(null, null)).toBe("Unlocated");
  });
});
