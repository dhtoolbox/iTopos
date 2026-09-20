import { describe, expect, it } from "vitest";

import {
  filterPlaces,
  getAvailableGroups,
  getAvailableTypes,
  normalizePlaceTypes,
} from "../../static/js/data/filters.js";
import { GROUP_NOT_SPECIFIED } from "../../static/js/constants.js";

describe("normalizePlaceTypes", () => {
  it("normalizes arrays", () => {
    expect(normalizePlaceTypes([" settlement ", "", "port"])).toEqual(["settlement", "port"]);
  });

  it("handles JSON encoded arrays", () => {
    expect(normalizePlaceTypes('["settlement", "port"]')).toEqual(["settlement", "port"]);
  });

  it("handles malformed JSON safely", () => {
    expect(normalizePlaceTypes("not-json")).toEqual([]);
  });
});

describe("getAvailableGroups", () => {
  it("returns no groups when grouping is disabled", () => {
    const dataset = {
      groupingEnabled: false,
      places: [
        {
          id: "1",
          mappable: true,
          userGroups: [],
        },
      ],
    };

    expect(getAvailableGroups(dataset)).toEqual([]);
  });

  it("returns user-defined groups", () => {
    const dataset = {
      groupingEnabled: true,
      places: [
        {
          id: "1",
          mappable: true,
          userGroups: ["B"],
        },
        {
          id: "2",
          mappable: true,
          userGroups: ["A"],
        },
      ],
    };

    expect(new Set(getAvailableGroups(dataset))).toEqual(new Set(["A", "B"]));
  });

  it("includes group-not-specified for mappable ungrouped places", () => {
    const dataset = {
      groupingEnabled: true,
      places: [
        {
          id: "1",
          mappable: true,
          userGroups: [],
        },
      ],
    };

    expect(getAvailableGroups(dataset)).toContain(GROUP_NOT_SPECIFIED);
  });

  it("does not include group-not-specified only because an unlocated place lacks a group", () => {
    const dataset = {
      groupingEnabled: true,
      places: [
        {
          id: "1",
          mappable: false,
          userGroups: [],
        },
      ],
    };

    expect(getAvailableGroups(dataset)).not.toContain(GROUP_NOT_SPECIFIED);
  });

  it("includes multiple-groups when a mappable place has multiple user groups", () => {
    const dataset = {
      groupingEnabled: true,
      places: [
        {
          id: "1",
          mappable: true,
          userGroups: ["A", "B"],
        },
      ],
    };

    const groups = getAvailableGroups(dataset);

    expect(groups).toContain("A");
    expect(groups).toContain("B");
  });
});

describe("getAvailableTypes", () => {
  it("finds types within active user groups", () => {
    const places = [
      {
        id: "1",
        userGroups: ["Cities"],
        place_types: ["settlement"],
      },
      {
        id: "2",
        userGroups: ["Ports"],
        place_types: ["port", "settlement"],
      },
    ];

    expect(
      getAvailableTypes(places, {
        groupingEnabled: true,
        activeGroups: ["Ports"],
      }),
    ).toEqual(["port", "settlement"]);
  });

  it("finds all types when grouping is disabled", () => {
    const places = [
      {
        id: "1",
        userGroups: [],
        place_types: ["settlement"],
      },
      {
        id: "2",
        userGroups: [],
        place_types: ["port"],
      },
    ];

    expect(
      new Set(
        getAvailableTypes(places, {
          groupingEnabled: false,
          activeGroups: [],
        }),
      ),
    ).toEqual(new Set(["settlement", "port"]));
  });

  it("has no available types when no groups are active", () => {
    const places = [
      {
        id: "1",
        userGroups: ["A"],
        place_types: ["settlement"],
      },
      {
        id: "2",
        userGroups: ["B"],
        place_types: ["port"],
      },
    ];

    expect(
      getAvailableTypes(places, {
        groupingEnabled: true,
        activeGroups: [],
      }),
    ).toEqual([]);
  });
});

describe("filterPlaces", () => {
  it("filters a multiple-group place through either user group", () => {
    const places = [
      {
        id: "1",
        userGroups: ["A", "B"],
        place_types: ["settlement"],
      },
    ];

    expect(
      filterPlaces(places, {
        groupingEnabled: true,
        activeGroups: ["A"],
        activeTypes: ["settlement"],
      }),
    ).toHaveLength(1);

    expect(
      filterPlaces(places, {
        groupingEnabled: true,
        activeGroups: ["B"],
        activeTypes: ["settlement"],
      }),
    ).toHaveLength(1);
  });

  it("filters places with unspecified groups explicitly", () => {
    const places = [
      {
        id: "1",
        userGroups: [],
        place_types: [],
      },
    ];

    expect(
      filterPlaces(places, {
        groupingEnabled: true,
        activeGroups: [GROUP_NOT_SPECIFIED],
        activeTypes: [],
      }),
    ).toHaveLength(0);
  });

  it("does not apply type filtering when type filters do not exist", () => {
    const places = [
      {
        id: "1",
        userGroups: [],
        place_types: [],
      },
    ];

    expect(
      filterPlaces(places, {
        groupingEnabled: true,
        activeGroups: [GROUP_NOT_SPECIFIED],
        activeTypes: null,
      }),
    ).toHaveLength(1);
  });

  it("ignores group filtering when grouping is disabled", () => {
    const places = [
      {
        id: "1",
        userGroups: [],
        place_types: ["settlement"],
      },
    ];

    expect(
      filterPlaces(places, {
        groupingEnabled: false,
        activeGroups: [],
        activeTypes: ["settlement"],
      }),
    ).toHaveLength(1);
  });

  it("excludes a place when none of its groups are active", () => {
    const places = [
      {
        id: "1",
        userGroups: ["A", "B"],
        place_types: ["settlement"],
      },
    ];

    const result = filterPlaces(places, {
      groupingEnabled: true,
      activeGroups: ["C"],
      activeTypes: ["settlement"],
    });

    expect(result).toEqual([]);
  });

  it("filters a multiple-group place by its real memberships", () => {
    const places = [
      {
        id: "993",
        userGroups: ["A", "B"],
        place_types: [],
      },
    ];

    expect(
      filterPlaces(places, {
        groupingEnabled: true,
        activeGroups: ["A", "B"],
        activeTypes: null,
      }),
    ).toHaveLength(1);

    expect(
      filterPlaces(places, {
        groupingEnabled: true,
        activeGroups: ["A"],
        activeTypes: null,
      }),
    ).toHaveLength(1);

    expect(
      filterPlaces(places, {
        groupingEnabled: true,
        activeGroups: ["B"],
        activeTypes: null,
      }),
    ).toHaveLength(1);

    expect(
      filterPlaces(places, {
        groupingEnabled: true,
        activeGroups: [],
        activeTypes: null,
      }),
    ).toHaveLength(0);
  });
});
