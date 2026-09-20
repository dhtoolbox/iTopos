import { describe, expect, it } from "vitest";

import { buildMarkerStyles, generateGroupColors } from "../../static/js/map/marker-styles.js";

import {
  GROUP_NOT_SPECIFIED,
  MULTIPLE_GROUPS_SPECIFIED,
  SPECIAL_MARKER_COLOR,
} from "../../static/js/constants.js";

function makeDataset(places, groupingEnabled = true) {
  return {
    groupingEnabled,
    places,
  };
}

describe("generateGroupColors", () => {
  it("generates the requested number of colors", () => {
    const colors = generateGroupColors(20);

    expect(colors).toHaveLength(20);

    for (const color of colors) {
      expect(color).toBeTruthy();
      expect(color).toMatch(/^hsl\(/);
    }
  });

  it("is deterministic", () => {
    expect(generateGroupColors(12)).toEqual(generateGroupColors(12));
  });

  it("does not reuse colors within one generated palette", () => {
    const colors = generateGroupColors(20);

    expect(new Set(colors).size).toBe(colors.length);
  });

  it("returns an empty palette for zero groups", () => {
    expect(generateGroupColors(0)).toEqual([]);
  });
});

describe("buildMarkerStyles", () => {
  it("creates no group styles when grouping is disabled", () => {
    const styles = buildMarkerStyles(
      makeDataset(
        [
          {
            mappable: true,
            userGroups: [],
            displayGroup: null,
          },
        ],
        false,
      ),
    );

    expect(styles.size).toBe(0);
  });

  it("assigns deterministic colors in natural group order", () => {
    const dataset = makeDataset([
      {
        mappable: true,
        userGroups: ["group10"],
        displayGroup: "group10",
      },
      {
        mappable: true,
        userGroups: ["group2"],
        displayGroup: "group2",
      },
      {
        mappable: true,
        userGroups: ["group1"],
        displayGroup: "group1",
      },
    ]);

    const styles = buildMarkerStyles(dataset);
    const colors = generateGroupColors(3);

    expect(styles.get("group1")).toEqual({
      kind: "group",
      color: colors[0],
    });

    expect(styles.get("group2")).toEqual({
      kind: "group",
      color: colors[1],
    });

    expect(styles.get("group10")).toEqual({
      kind: "group",
      color: colors[2],
    });
  });

  it("assigns colors to real memberships of a multiple-group place", () => {
    const styles = buildMarkerStyles(
      makeDataset([
        {
          mappable: true,
          userGroups: ["B", "A"],
          displayGroup: MULTIPLE_GROUPS_SPECIFIED,
        },
      ]),
    );

    const colors = generateGroupColors(2);

    expect(styles.get("A")).toEqual({
      kind: "group",
      color: colors[0],
    });

    expect(styles.get("B")).toEqual({
      kind: "group",
      color: colors[1],
    });

    expect(styles.get(MULTIPLE_GROUPS_SPECIFIED)).toEqual({
      kind: "multiple",
      color: SPECIAL_MARKER_COLOR,
    });
  });

  it("creates the unspecified marker style without consuming a group color", () => {
    const styles = buildMarkerStyles(
      makeDataset([
        {
          mappable: true,
          userGroups: [],
          displayGroup: GROUP_NOT_SPECIFIED,
        },
        {
          mappable: true,
          userGroups: ["A"],
          displayGroup: "A",
        },
      ]),
    );

    expect(styles.get("A").color).toBe(generateGroupColors(1)[0]);
    expect(styles.get(GROUP_NOT_SPECIFIED)).toEqual({
      kind: "unspecified",
      color: SPECIAL_MARKER_COLOR,
    });
  });

  it("ignores unlocated places when building styles", () => {
    const styles = buildMarkerStyles(
      makeDataset([
        {
          mappable: false,
          userGroups: ["Hidden"],
          displayGroup: null,
        },
        {
          mappable: true,
          userGroups: ["Visible"],
          displayGroup: "Visible",
        },
      ]),
    );

    expect(styles.has("Hidden")).toBe(false);
    expect(styles.has("Visible")).toBe(true);
  });

  it("does not leak colors between datasets", () => {
    const first = buildMarkerStyles(
      makeDataset(
        Array.from({ length: 12 }, (_, index) => {
          const group = `group${index + 1}`;

          return {
            mappable: true,
            userGroups: [group],
            displayGroup: group,
          };
        }),
      ),
    );

    const second = buildMarkerStyles(
      makeDataset([
        {
          mappable: true,
          userGroups: ["A"],
          displayGroup: "A",
        },
        {
          mappable: true,
          userGroups: ["B"],
          displayGroup: "B",
        },
      ]),
    );

    expect(first.size).toBe(12);
    expect(second.size).toBe(2);

    expect(second.get("A").color).toBe(generateGroupColors(2)[0]);
    expect(second.get("B").color).toBe(generateGroupColors(2)[1]);
  });

  it("generates one color per group", () => {
    expect(generateGroupColors(30)).toHaveLength(30);
  });
});
