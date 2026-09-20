import { describe, expect, it } from "vitest";

import { buildExploreModel, getFilteredPlaces, formatExploreGroup } from "../../static/js/widgets/explore.js";

import { GROUP_NOT_SPECIFIED, MULTIPLE_GROUPS_SPECIFIED } from "../../static/js/constants.js";

describe("buildExploreModel", () => {
  it("hides Explore when there are no group or feature-category filters", () => {
    const model = buildExploreModel({
      groupingEnabled: false,
      places: [
        {
          id: "1",
          mappable: true,
          userGroups: [],
          displayGroup: null,
          place_types: [],
        },
      ],
    });

    expect(model.visible).toBe(false);
    expect(model.groups).toEqual([]);
    expect(model.types).toEqual([]);
  });

  it("shows type filters without grouping", () => {
    const model = buildExploreModel({
      groupingEnabled: false,
      places: [
        {
          id: "1",
          mappable: true,
          userGroups: [],
          displayGroup: null,
          place_types: ["settlement"],
        },
      ],
    });

    expect(model.visible).toBe(true);
    expect(model.groups).toEqual([]);

    expect(model.types).toEqual(["settlement"]);
    expect(model.typeCounts.get("settlement")).toBe(1);
  });

  it("uses real memberships as group filters", () => {
    const model = buildExploreModel({
      groupingEnabled: true,
      places: [
        {
          id: "993",
          mappable: true,
          userGroups: ["B", "A"],
          displayGroup: MULTIPLE_GROUPS_SPECIFIED,
          place_types: ["region"],
        },
      ],
    });

    expect(model.groups).toEqual(["A", "B"]);
    expect(model.markerStyles.get("A").color).toBeDefined();
    expect(model.markerStyles.get("A").kind).toBe("group");
    expect(model.markerStyles.get("B").kind).toBe("group");
    expect(model.markerStyles.get(MULTIPLE_GROUPS_SPECIFIED).kind).toBe("multiple");
    expect(model.groupCounts.get("A")).toBe(1);
    expect(model.groupCounts.get("B")).toBe(1);
  });

  it("does not make multiple-groups a filter", () => {
    const model = buildExploreModel({
      groupingEnabled: true,
      places: [
        {
          id: "993",
          mappable: true,
          userGroups: ["A", "B"],
          displayGroup: MULTIPLE_GROUPS_SPECIFIED,
          place_types: [],
        },
      ],
    });

    expect(model.groups).not.toContain(MULTIPLE_GROUPS_SPECIFIED);
    expect(model.hasMultipleGroups).toBe(true);
    expect(model.markerStyles.get("A").color).toBeDefined();
  });

  it("does not make multiple-groups a filter", () => {
    const model = buildExploreModel({
      groupingEnabled: true,
      places: [
        {
          id: "993",
          mappable: true,
          userGroups: ["A", "B"],
          displayGroup: MULTIPLE_GROUPS_SPECIFIED,
          place_types: [],
        },
      ],
    });

    expect(model.groups).toEqual(["A", "B"]);
    expect(model.groups).not.toContain(MULTIPLE_GROUPS_SPECIFIED);
    expect(model.hasMultipleGroups).toBe(true);
    expect(model.markerStyles.get(MULTIPLE_GROUPS_SPECIFIED).kind).toBe("multiple");
  });

  it("includes group-not-specified as a filter", () => {
    const model = buildExploreModel({
      groupingEnabled: true,
      places: [
        {
          id: "1",
          mappable: true,
          userGroups: [],
          displayGroup: GROUP_NOT_SPECIFIED,
          place_types: [],
        },
      ],
    });

    expect(model.groups).toContain(GROUP_NOT_SPECIFIED);
  });
});

it("counts only mappable Places in Explore facets", () => {
  const model = buildExploreModel({
    groupingEnabled: true,
    places: [
      { id: "1", mappable: true, userGroups: ["A"], displayGroup: "A", place_types: ["castle", "fort"] },
      { id: "2", mappable: true, userGroups: ["A", "B"], displayGroup: MULTIPLE_GROUPS_SPECIFIED, place_types: ["castle"] },
      { id: "3", mappable: false, userGroups: ["A"], displayGroup: "A", place_types: ["castle"] },
    ],
  });

  expect(model.groupCounts.get("A")).toBe(2);
  expect(model.groupCounts.get("B")).toBe(1);
  expect(model.typeCounts.get("castle")).toBe(2);
  expect(model.typeCounts.get("fort")).toBe(1);
});

describe("formatExploreGroup", () => {
  it("labels unspecified groups specially", () => {
    expect(formatExploreGroup(GROUP_NOT_SPECIFIED)).toEqual({
      label: GROUP_NOT_SPECIFIED,
      kind: "unspecified",
    });
  });
});

describe("getFilteredPlaces", () => {
  it("keeps places without place types when all type filters are selected", () => {
    const dataset = {
      groupingEnabled: false,
      places: [
        { id: "1", mappable: true, place_types: ["settlement"], userGroups: [] },
        { id: "2", mappable: true, place_types: [], userGroups: [] },
      ],
    };

    const state = {
      activeGroups: new Set(),
      uncheckedPlaceTypes: new Set(),
    };

    expect(getFilteredPlaces(dataset, state).map((place) => place.id)).toEqual(["1", "2"]);
  });
});
