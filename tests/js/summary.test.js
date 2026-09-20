import { describe, expect, it } from "vitest";

import { calculateProcessingSummary } from "../../static/js/data/summary.js";

function makeDataset({ rows = [], places = [], groupingEnabled = false } = {}) {
  return {
    rows,
    places,
    groupingEnabled,
  };
}

function emptyDuplicates() {
  return {
    duplicateIDs: [],
    duplicatePairs: [],
    crossGroupConflicts: [],
  };
}

function emptyResult() {
  return {
    not_found: [],
    invalid: [],
  };
}

describe("calculateProcessingSummary", () => {
  it("counts matched mappable rows and unique places", () => {
    const dataset = makeDataset({
      rows: [{ id: "579885" }, { id: "570182" }],
      places: [
        {
          id: "579885",
          mappable: true,
          userGroups: [],
        },
        {
          id: "570182",
          mappable: true,
          userGroups: [],
        },
      ],
    });

    const summary = calculateProcessingSummary(
      dataset,
      new Set(),
      emptyDuplicates(),
      emptyResult(),
    );

    expect(summary).toMatchObject({
      rowsProcessed: 2,
      matchedRows: 2,
      mappablePlaces: 2,
      uniquePleiadesIds: 2,
      groups: 0,
      unlocatedPlaces: 0,
      notFoundIds: 0,
      invalidIds: 0,
    });
  });

  it("keeps duplicate rows separate from unique places", () => {
    const dataset = makeDataset({
      rows: [
        {
          id: "579885",
          group: "A",
        },
        {
          id: "579885",
          group: "A",
        },
      ],
      places: [
        {
          id: "579885",
          mappable: true,
          userGroups: ["A"],
        },
      ],
      groupingEnabled: true,
    });

    const duplicates = {
      duplicateIDs: [
        {
          id: "579885",
          count: 2,
        },
      ],
      duplicatePairs: [
        {
          id: "579885",
          group: "A",
          count: 2,
        },
      ],
      crossGroupConflicts: [],
    };

    const summary = calculateProcessingSummary(dataset, new Set(["A"]), duplicates, emptyResult());

    expect(summary).toMatchObject({
      rowsProcessed: 2,
      matchedRows: 2,
      mappablePlaces: 1,
      uniquePleiadesIds: 1,
      duplicateIds: 1,
      duplicatePairs: 1,
    });
  });

  it("reports matched unlocated places", () => {
    const dataset = makeDataset({
      rows: [{ id: "12345" }, { id: "12345" }],
      places: [
        {
          id: "12345",
          mappable: false,
          userGroups: [],
        },
      ],
    });

    const summary = calculateProcessingSummary(
      dataset,
      new Set(),
      emptyDuplicates(),
      emptyResult(),
    );

    expect(summary).toMatchObject({
      rowsProcessed: 2,
      matchedRows: 2,
      mappablePlaces: 0,
      uniquePleiadesIds: 1,
      unlocatedPlaces: 1,
      unlocatedIds: ["12345"],
    });
  });

  it("reports zero groups when grouping is disabled", () => {
    const dataset = makeDataset({
      rows: [
        {
          id: "993",
          group: null,
        },
      ],
      places: [
        {
          id: "993",
          mappable: true,
          userGroups: [],
        },
      ],
      groupingEnabled: false,
    });

    const summary = calculateProcessingSummary(
      dataset,
      new Set(),
      emptyDuplicates(),
      emptyResult(),
    );

    expect(summary.groups).toBe(0);

    expect(summary.unspecifiedGroupPlaces).toBe(0);
  });

  it("counts user-supplied groups when grouping is enabled", () => {
    const dataset = makeDataset({
      groupingEnabled: true,
    });

    const summary = calculateProcessingSummary(
      dataset,
      new Set(["A", "B"]),
      emptyDuplicates(),
      emptyResult(),
    );

    expect(summary.groups).toBe(2);
  });

  it("reports group-not-specified when grouping is enabled", () => {
    const dataset = makeDataset({
      rows: [
        {
          id: "1",
          group: null,
        },
      ],
      places: [
        {
          id: "1",
          mappable: true,
          userGroups: [],
        },
      ],
      groupingEnabled: true,
    });

    const summary = calculateProcessingSummary(
      dataset,
      new Set(),
      emptyDuplicates(),
      emptyResult(),
    );

    expect(summary.unspecifiedGroupPlaces).toBe(1);

    expect(summary.unspecifiedGroupIds).toEqual(["1"]);
  });

  it("reports one place assigned to multiple groups", () => {
    const dataset = makeDataset({
      rows: [
        {
          id: "1",
          group: "B",
        },
        {
          id: "1",
          group: "A",
        },
      ],
      places: [
        {
          id: "1",
          mappable: true,
          userGroups: ["B", "A"],
        },
      ],
      groupingEnabled: true,
    });

    const summary = calculateProcessingSummary(
      dataset,
      new Set(["A", "B"]),
      emptyDuplicates(),
      emptyResult(),
    );

    expect(summary.multipleGroupPlaces).toBe(1);

    expect(summary.multipleGroupIds).toEqual(["1"]);
  });

  it("preserves not-found and invalid values", () => {
    const dataset = makeDataset({
      rows: [{ id: "999999" }, { id: "banana" }],
    });

    const summary = calculateProcessingSummary(dataset, new Set(), emptyDuplicates(), {
      not_found: [999999],
      invalid: ["banana"],
    });

    expect(summary).toMatchObject({
      rowsProcessed: 2,
      matchedRows: 0,
      mappablePlaces: 0,
      uniquePleiadesIds: 0,
      notFoundIds: 1,
      invalidIds: 1,
      notFoundValues: [999999],
      invalidValues: ["banana"],
    });
  });

  it("counts mappable places independently of unmatched rows", () => {
    const dataset = makeDataset({
      rows: [{ id: "579885" }, { id: "invalid_id" }],
      places: [
        {
          id: "579885",
          mappable: true,
          userGroups: [],
        },
      ],
    });

    const summary = calculateProcessingSummary(dataset, new Set(), emptyDuplicates(), {
      not_found: [],
      invalid: ["invalid_id"],
    });

    expect(summary.rowsProcessed).toBe(2);
    expect(summary.matchedRows).toBe(1);
    expect(summary.mappablePlaces).toBe(1);
    expect(summary.uniquePleiadesIds).toBe(1);
  });

  it("counts duplicate grouped rows as one mappable place", () => {
    const dataset = makeDataset({
      rows: [
        { id: "993", group: "A" },
        { id: "993", group: "B" },
      ],
      places: [
        {
          id: "993",
          mappable: true,
          userGroups: ["A", "B"],
        },
      ],
      groupingEnabled: true,
    });

    const summary = calculateProcessingSummary(dataset, new Set(["A", "B"]), emptyDuplicates(), {
      not_found: [],
      invalid: [],
    });

    expect(summary.rowsProcessed).toBe(2);
    expect(summary.matchedRows).toBe(2);
    expect(summary.mappablePlaces).toBe(1);
    expect(summary.uniquePleiadesIds).toBe(1);
    expect(summary.multipleGroupPlaces).toBe(1);
  });
});
