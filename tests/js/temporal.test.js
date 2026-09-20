import { describe, expect, it } from "vitest";
import {
  buildTemporalModel,
  buildTemporalPlaceEvidence,
  buildTemporalScale,
  buildNiceTicks,
  chronologicalPercent,
  chooseInitialPeriodIndexes,
  formatYear,
  groupDisplayedPeriods,
  packPeriodGroups,
  summarizeTemporalPeriods,
} from "../../static/js/widgets/temporal.js";

const periods = [
  ["classical", "Classical", -500, -330],
  ["hell", "Hellenistic", -330, -30],
  ["roman", "Roman", -30, 300],
];

describe("temporal score model", () => {
  it("keeps attested Pleiades periods as the selectable units", () => {
    const records = new Map([["1", {
      total_locations: 3,
      total_names: 2,
      locations: [{ types: [2, 3], attestations: [[0, 0], [1, 0], [2, 0]] }],
      names: [{ attestations: [[1, 0], [2, 0]] }],
    }]]);
    const model = buildTemporalModel(records, periods, new Set([0]));
    expect(model.periodStats.map((item) => item.periodIndex)).toEqual([0, 1, 2]);
    expect(model.periodStats[1]).toMatchObject({ places: 1, locations: 1, names: 1 });
    expect(summarizeTemporalPeriods(model, new Set([1, 2]))).toEqual({ places: 1, locations: 1, names: 1, types: 2, periods: 2 });
  });

  it("groups periods with identical numeric intervals into one score line", () => {
    const stats = [
      { periodIndex: 0, start: -30, end: 300 },
      { periodIndex: 1, start: -30, end: 300 },
      { periodIndex: 2, start: 300, end: 640 },
    ];
    expect(groupDisplayedPeriods([0, 1, 2], stats)).toEqual([
      { start: -30, end: 300, periodIndexes: [0, 1], places: new Set() },
      { start: 300, end: 640, periodIndexes: [2], places: new Set() },
    ]);
  });

  it("packs non-overlapping intervals back onto the same lane", () => {
    const groups = [
      { start: 0, end: 10, periodIndexes: [0] },
      { start: 3, end: 8, periodIndexes: [1] },
      { start: 10, end: 20, periodIndexes: [2] },
    ];
    const packed = packPeriodGroups(groups);
    expect(packed.laneCount).toBe(2);
    expect(packed.groups.map((item) => item.lane)).toEqual([0, 1, 0]);
  });

  it("chooses all periods when five or fewer are represented", () => {
    const stats = [0, 1, 2].map((periodIndex) => ({ periodIndex, start: periodIndex, end: periodIndex + 1, places: 1, evidence: 1 }));
    expect(chooseInitialPeriodIndexes(stats)).toEqual([0, 1, 2]);
  });

  it("chooses coverage, beginning, middle, end, and a wildcard for a larger corpus", () => {
    const stats = [
      { periodIndex: 0, start: 0, end: 10, places: 2, evidence: 2 },
      { periodIndex: 1, start: 10, end: 20, places: 3, evidence: 3 },
      { periodIndex: 2, start: 20, end: 30, places: 50, evidence: 50 },
      { periodIndex: 3, start: 30, end: 40, places: 4, evidence: 4 },
      { periodIndex: 4, start: 40, end: 50, places: 5, evidence: 5 },
      { periodIndex: 5, start: 50, end: 60, places: 6, evidence: 6 },
    ];
    const chosen = chooseInitialPeriodIndexes(stats, 5, () => 0);
    expect(chosen).toHaveLength(5);
    expect(chosen).toContain(2); // maximum coverage
    expect(chosen).toContain(0); // beginning
    expect(chosen).toContain(5); // end
    expect(new Set(chosen).size).toBe(5);
  });

  it("keeps ordinary displayed ranges on a linear chronological scale", () => {
    const scale = buildTemporalScale(-500, 500, [-500, -250, 0, 250, 500]);
    expect(scale.hasBreak).toBe(false);
    expect(scale.percent(0)).toBeCloseTo(50);
  });

  it("compresses an extreme empty temporal gap without reversing chronology", () => {
    const scale = buildTemporalScale(-2600000, 2100, [-2600000, -125000, -18000, -500, 2100]);
    expect(scale.hasBreak).toBe(true);
    expect(scale.percent(-2600000)).toBe(0);
    expect(scale.percent(-125000)).toBeGreaterThan(scale.percent(-2600000));
    expect(scale.percent(-18000)).toBeGreaterThan(scale.percent(-125000));
    expect(scale.percent(2100)).toBeCloseTo(100);
  });

  it("requires at least two represented periods", () => {
    const records = new Map([["1", { locations: [{ types: [2], attestations: [[1, 0]] }], names: [] }]]);
    expect(buildTemporalModel(records, periods, new Set([0]))).toBeNull();
  });

  it("excludes disallowed confidence", () => {
    const records = new Map([["1", { locations: [{ types: [2], attestations: [[0, 2], [1, 0]] }], names: [] }]]);
    expect(buildTemporalModel(records, periods, new Set([0]))).toBeNull();
  });

  it("uses a real chronological axis", () => {
    expect(chronologicalPercent(0, -100, 300)).toBe(25);
    expect(chronologicalPercent(300, -100, 300)).toBe(100);
  });

  it("builds restrained interior axis ticks", () => {
    const ticks = buildNiceTicks(-1600, 2100, 3);
    expect(ticks.length).toBeLessThanOrEqual(3);
    expect(ticks.every((tick) => tick > -1600 && tick < 2100)).toBe(true);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  it("formats BCE and CE", () => {
    expect(formatYear(-330)).toBe("330 BCE");
    expect(formatYear(300)).toBe("300 CE");
  });
  it("builds per-place active counts and a confidence evidence matrix", () => {
    const records = new Map([["1", {
      total_locations: 3,
      total_names: 2,
      locations: [
        { types: [2], attestations: [[0, 0], [1, 2]] },
        { types: [3], attestations: [[1, 0]] },
      ],
      names: [{ attestations: [[1, 0], [2, 2]] }],
    }]]);
    const confidences = ["confident", "confident-inferred", "less-confident"];
    const evidence = buildTemporalPlaceEvidence(records, periods, confidences, new Set([1]), new Set([0]));
    expect(evidence.get("1")).toMatchObject({
      active: true,
      activeLocations: 1,
      activeNames: 1,
      totalLocations: 3,
      totalNames: 2,
    });
    const hellenistic = evidence.get("1").temporalRows.find((row) => row.periodIndex === 1);
    expect(hellenistic.selected).toBe(true);
    expect(hellenistic.confidences).toEqual(expect.arrayContaining([
      expect.objectContaining({ confidence: "less-confident", locations: 1, allowed: false }),
      expect.objectContaining({ confidence: "confident", locations: 1, names: 1, allowed: true }),
    ]));
  });

  it("preserves count-only Places with unspecified date ranges for popup evidence", () => {
    const records = new Map([["461726239", {
      total_locations: 1,
      total_names: 0,
      locations: [],
      names: [],
    }]]);
    const evidence = buildTemporalPlaceEvidence(
      records, periods, ["confident"], new Set(), new Set([0]),
    );
    expect(evidence.get("461726239")).toMatchObject({
      active: false,
      attestedLocations: 0,
      totalLocations: 1,
      totalNames: 0,
      temporalRows: [],
    });
  });

  it("does not break a single displayed period just because the period itself is very long", () => {
    const scale = buildTemporalScale(-2600000, -18000, [-2600000, -18000]);
    expect(scale.hasBreak).toBe(false);
    expect(scale.percent(-2600000)).toBe(0);
    expect(scale.percent(-18000)).toBe(100);
  });

});
