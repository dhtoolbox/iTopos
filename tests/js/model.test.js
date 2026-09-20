import { describe, expect, it } from "vitest";

import {
  buildDataset,
  determineDisplayGroup,


} from "../../static/js/data/model.js";
import { GROUP_NOT_SPECIFIED, MULTIPLE_GROUPS_SPECIFIED } from "../../static/js/constants.js";

const ATHENS = {
  id: 579885,
  title: "Athens",
  repr_lat: 37.97,
  repr_lng: 23.72,
  place_types: ["settlement"],
};

describe("buildDataset", () => {
  it("creates one place from one matched row", () => {
    const rows = [
      {
        row: 1,
        id: "579885",
        group: null,
      },
    ];

    const dataset = buildDataset(rows, [ATHENS], {
      groupingEnabled: false,
    });

    expect(dataset.groupingEnabled).toBe(false);

    expect(dataset.places).toHaveLength(1);

    expect(dataset.places[0]).toEqual({
      id: "579885",
      title: "Athens",
      repr_lat: 37.97,
      repr_lng: 23.72,
      place_types: ["settlement"],
      userGroups: [],
      displayGroup: null,
      mappable: true,
    });
  });

  it("does not invent a group when grouping is disabled", () => {
    const rows = [
      {
        id: "579885",
        group: null,
      },
    ];

    const dataset = buildDataset(rows, [ATHENS], {
      groupingEnabled: false,
    });

    expect(dataset.places[0].userGroups).toEqual([]);

    expect(dataset.places[0].displayGroup).toBeNull();
  });

  it("aggregates duplicate rows into one place", () => {
    const rows = [
      {
        row: 2,
        id: "579885",
        group: "Good",
      },
      {
        row: 3,
        id: "579885",
        group: "Good",
      },
    ];

    const dataset = buildDataset(rows, [ATHENS], {
      groupingEnabled: true,
    });

    expect(dataset.rows).toHaveLength(2);
    expect(dataset.places).toHaveLength(1);

    expect(dataset.places[0].userGroups).toEqual(["Good"]);

    expect(dataset.places[0].displayGroup).toBe("Good");
  });

  it("aggregates multiple user groups onto one place", () => {
    const rows = [
      {
        row: 2,
        id: "579885",
        group: "A",
      },
      {
        row: 3,
        id: "579885",
        group: "B",
      },
    ];

    const dataset = buildDataset(rows, [ATHENS], {
      groupingEnabled: true,
    });

    expect(dataset.places).toHaveLength(1);

    expect(dataset.places[0].userGroups).toEqual(["A", "B"]);

    expect(dataset.places[0].displayGroup).toBe(MULTIPLE_GROUPS_SPECIFIED);
  });

  it("deduplicates repeated group memberships", () => {
    const rows = [
      {
        id: "579885",
        group: "A",
      },
      {
        id: "579885",
        group: "A",
      },
      {
        id: "579885",
        group: "B",
      },
    ];

    const dataset = buildDataset(rows, [ATHENS], {
      groupingEnabled: true,
    });

    expect(dataset.places[0].userGroups).toEqual(["A", "B"]);
  });

  it("marks a mappable place when grouping exists but no group was specified", () => {
    const rows = [
      {
        id: "579885",
        group: null,
      },
    ];

    const dataset = buildDataset(rows, [ATHENS], {
      groupingEnabled: true,
    });

    expect(dataset.places[0].userGroups).toEqual([]);

    expect(dataset.places[0].displayGroup).toBe(GROUP_NOT_SPECIFIED);
  });

  it("treats a blank group cell as not specified", () => {
    const rows = [
      {
        id: "579885",
        group: "   ",
      },
    ];

    const dataset = buildDataset(rows, [ATHENS], {
      groupingEnabled: true,
    });

    expect(dataset.places[0].displayGroup).toBe(GROUP_NOT_SPECIFIED);
  });

  it("keeps matched unlocated places but gives them no display group", () => {
    const unlocated = {
      id: 123456,
      title: "Unlocated Place",
      repr_lat: null,
      repr_lng: null,
      place_types: ["settlement"],
    };

    const rows = [
      {
        id: "123456",
        group: "A",
      },
    ];

    const dataset = buildDataset(rows, [unlocated], {
      groupingEnabled: true,
    });

    expect(dataset.places).toHaveLength(1);

    expect(dataset.places[0].userGroups).toEqual(["A"]);

    expect(dataset.places[0].mappable).toBe(false);

    expect(dataset.places[0].displayGroup).toBeNull();
  });

  it("does not create places for unresolved rows", () => {
    const rows = [
      {
        id: "579885",
        group: "A",
      },
      {
        id: "999999999",
        group: "B",
      },
      {
        id: "banana",
        group: "C",
      },
    ];

    const dataset = buildDataset(rows, [ATHENS], {
      groupingEnabled: true,
    });

    expect(dataset.rows).toHaveLength(3);
    expect(dataset.places).toHaveLength(1);

    expect(dataset.places[0].id).toBe("579885");
  });

  it("builds the normalized dataset contract", () => {
    const rows = [
      {
        row: 2,
        id: "579885",
        group: "Cities",
      },
    ];

    const resolved = [
      {
        id: 579885,
        title: "Athens",
        repr_lat: 37.97,
        repr_lng: 23.72,
        place_types: ["settlement"],
      },
    ];

    const dataset = buildDataset(rows, resolved, {
      groupingEnabled: true,
    });

    expect(dataset).toEqual({
      groupingEnabled: true,

      rows,

      places: [
        {
          id: "579885",
          title: "Athens",
          repr_lat: 37.97,
          repr_lng: 23.72,
          place_types: ["settlement"],

          userGroups: ["Cities"],
          displayGroup: "Cities",

          mappable: true,
        },
      ],
    });
  });

  it("preserves grouping-enabled state", () => {
    const dataset = buildDataset([], [], {
      groupingEnabled: true,
    });

    expect(dataset.groupingEnabled).toBe(true);
  });

  it("defaults to grouping disabled", () => {
    const dataset = buildDataset([], []);

    expect(dataset.groupingEnabled).toBe(false);
  });

  it("stores one user-defined group as an array", () => {
    const dataset = buildDataset(
      [
        {
          id: "579885",
          group: "Cities",
        },
      ],
      [ATHENS],
      {
        groupingEnabled: true,
      },
    );

    expect(dataset.places[0].userGroups).toEqual(["Cities"]);
  });

  it("aggregates multiple groups for one Pleiades place", () => {
    const dataset = buildDataset(
      [
        {
          id: "579885",
          group: "B",
        },
        {
          id: "579885",
          group: "A",
        },
      ],
      [ATHENS],
      {
        groupingEnabled: true,
      },
    );

    expect(dataset.places[0].userGroups).toEqual(["B", "A"]);
  });

  it("does not duplicate repeated user-group membership", () => {
    const dataset = buildDataset(
      [
        {
          id: "579885",
          group: "A",
        },
        {
          id: "579885",
          group: "A",
        },
      ],
      [ATHENS],
      {
        groupingEnabled: true,
      },
    );

    expect(dataset.places[0].userGroups).toEqual(["A"]);
  });

  it("does not collect groups when grouping is disabled", () => {
    const dataset = buildDataset(
      [
        {
          id: "579885",

          // Data may physically exist in column B,
          // but no recognized group header opted
          // the dataset into grouping.
          group: "Cities",
        },
      ],
      [ATHENS],
      {
        groupingEnabled: false,
      },
    );

    expect(dataset.places[0].userGroups).toEqual([]);
  });

  it("has no display group when grouping is disabled", () => {
    const dataset = buildDataset(
      [
        {
          id: "579885",
          group: null,
        },
      ],
      [ATHENS],
      {
        groupingEnabled: false,
      },
    );

    expect(dataset.places[0].displayGroup).toBeNull();
  });

  it("marks a mappable place when its group was not specified", () => {
    const dataset = buildDataset(
      [
        {
          id: "579885",
          group: null,
        },
      ],
      [ATHENS],
      {
        groupingEnabled: true,
      },
    );

    expect(dataset.places[0].displayGroup).toBe(GROUP_NOT_SPECIFIED);
  });

  it("uses the user group as the display group", () => {
    const dataset = buildDataset(
      [
        {
          id: "579885",
          group: "Cities",
        },
      ],
      [ATHENS],
      {
        groupingEnabled: true,
      },
    );

    expect(dataset.places[0].displayGroup).toBe("Cities");
  });

  it("marks a place assigned to multiple groups", () => {
    const dataset = buildDataset(
      [
        {
          id: "579885",
          group: "A",
        },
        {
          id: "579885",
          group: "B",
        },
      ],
      [ATHENS],
      {
        groupingEnabled: true,
      },
    );

    expect(dataset.places[0].displayGroup).toBe(MULTIPLE_GROUPS_SPECIFIED);
  });

  it("gives an unlocated place no display group", () => {
    const unlocated = {
      id: 123456,
      title: "Somewhere",
      repr_lat: null,
      repr_lng: null,
      place_types: [],
    };

    const dataset = buildDataset(
      [
        {
          id: "123456",
          group: "Cities",
        },
      ],
      [unlocated],
      {
        groupingEnabled: true,
      },
    );

    expect(dataset.places[0].userGroups).toEqual(["Cities"]);

    expect(dataset.places[0].mappable).toBe(false);

    expect(dataset.places[0].displayGroup).toBeNull();
  });

  it("creates one normalized place per Pleiades ID", () => {
    const dataset = buildDataset(
      [
        {
          row: 2,
          id: "579885",
          group: "A",
        },
        {
          row: 3,
          id: "579885",
          group: "B",
        },
        {
          row: 4,
          id: "579885",
          group: "A",
        },
      ],
      [ATHENS],
      {
        groupingEnabled: true,
      },
    );

    expect(dataset.rows).toHaveLength(3);

    expect(dataset.places).toHaveLength(1);

    expect(dataset.places[0].userGroups).toEqual(["A", "B"]);
  });

  it("does not mark group-not-specified when another row supplies a group", () => {
    const dataset = buildDataset(
      [
        {
          id: "579885",
          group: null,
        },
        {
          id: "579885",
          group: "A",
        },
      ],
      [ATHENS],
      {
        groupingEnabled: true,
      },
    );

    expect(dataset.places[0].userGroups).toEqual(["A"]);

    expect(dataset.places[0].displayGroup).toBe("A");
  });
});

describe("determineDisplayGroup", () => {
  it("returns null for unlocated places", () => {
    expect(
      determineDisplayGroup(
        {
          mappable: false,
          userGroups: ["A"],
        },
        true,
      ),
    ).toBeNull();
  });

  it("returns null when grouping is disabled", () => {
    expect(
      determineDisplayGroup(
        {
          mappable: true,
          userGroups: [],
        },
        false,
      ),
    ).toBeNull();
  });

  it("returns group-not-specified when grouping is enabled but empty", () => {
    expect(
      determineDisplayGroup(
        {
          mappable: true,
          userGroups: [],
        },
        true,
      ),
    ).toBe(GROUP_NOT_SPECIFIED);
  });

  it("returns the only user group", () => {
    expect(
      determineDisplayGroup(
        {
          mappable: true,
          userGroups: ["A"],
        },
        true,
      ),
    ).toBe("A");
  });

  it("returns multiple-groups for more than one user group", () => {
    expect(
      determineDisplayGroup(
        {
          mappable: true,
          userGroups: ["A", "B"],
        },
        true,
      ),
    ).toBe(MULTIPLE_GROUPS_SPECIFIED);
  });

  it("preserves first-seen user group order", () => {
    const rows = [
      {
        id: "579885",
        group: "B",
      },
      {
        id: "579885",
        group: "A",
      },
    ];

    const dataset = buildDataset(rows, [ATHENS], {
      groupingEnabled: true,
    });

    expect(dataset.places[0].userGroups).toEqual(["B", "A"]);
  });
});
