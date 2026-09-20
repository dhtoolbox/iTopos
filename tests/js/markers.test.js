import { describe, expect, it } from "vitest";
import { buildHighlightMarkers, buildMapMarkers, getRepresentativePoint } from "../../static/js/map/markers.js";
import {
  GROUP_NOT_SPECIFIED,
  MULTIPLE_GROUPS_SPECIFIED,
  SPECIAL_MARKER_COLOR,
} from "../../static/js/constants.js";
import { getPlaceCoordinates } from "../../static/map.js";

describe("getRepresentativePoint", () => {
  it("returns longitude and latitude", () => {
    expect(
      getRepresentativePoint({
        repr_lat: 37.97,
        repr_lng: 23.72,
      }),
    ).toEqual([23.72, 37.97]);
  });

  it("accepts numeric strings", () => {
    expect(
      getRepresentativePoint({
        repr_lat: "37.97",
        repr_lng: "23.72",
      }),
    ).toEqual([23.72, 37.97]);
  });

  it("rejects an unlocated place", () => {
    expect(
      getRepresentativePoint({
        repr_lat: null,
        repr_lng: null,
      }),
    ).toBeNull();
  });

  it("rejects partial coordinates", () => {
    expect(
      getRepresentativePoint({
        repr_lat: 37.97,
        repr_lng: null,
      }),
    ).toBeNull();
  });
});

describe("getPlaceCoordinates", () => {
  it("returns coordinates only for mappable places", () => {
    expect(
      getPlaceCoordinates([
        {
          mappable: true,
          repr_lat: 10,
          repr_lng: 20,
        },
        {
          mappable: false,
          repr_lat: null,
          repr_lng: null,
        },
      ]),
    ).toEqual([[20, 10]]);
  });
});

describe("buildMapMarkers", () => {
  it("builds a marker from a mappable place", () => {
    const result = buildMapMarkers(
      [
        {
          id: "579885",
          title: "Athens",
          repr_lat: 37.97,
          repr_lng: 23.72,
          mappable: true,
          userGroups: ["Cities"],
          displayGroup: "Cities",
          place_types: ["settlement"],
          coincident: false,
        },
      ],
      () => ({
        kind: "group",
        color: "#123456",
      }),
    );

    expect(result.points).toHaveLength(1);

    expect(result.points[0]).toEqual({
      type: "Feature",
      id: "579885",
      geometry: {
        type: "Point",
        coordinates: [23.72, 37.97],
      },
      properties: {
        pleiades_id: "579885",
        title: "Athens",
        display_group: "Cities",
        user_groups: ["Cities"],
        color: "#123456",
        marker_kind: "group",
        place_types: ["settlement"],
        place_count: 1,
        coincident: false,
        repr_lat: 37.97,
        repr_lng: 23.72,
        temporal_active: false,
        active_locations: 0,
        active_names: 0,
        active_place_count: 0,
      },
    });

    expect(result.coordinates).toEqual([[23.72, 37.97]]);
    expect(result.points[0].properties.marker_kind).toBe("group");
  });

  it("does not build a marker for an unlocated place", () => {
    const result = buildMapMarkers([
      {
        id: "123456",
        title: "Unlocated Place",
        repr_lat: null,
        repr_lng: null,
        mappable: false,
        userGroups: ["A"],
        displayGroup: null,
        place_types: [],
      },
    ]);

    expect(result.points).toEqual([]);
    expect(result.coordinates).toEqual([]);
  });

  it("preserves multiple user groups in marker properties", () => {
    const result = buildMapMarkers([
      {
        id: "579885",
        title: "Athens",
        repr_lat: 37.97,
        repr_lng: 23.72,
        mappable: true,
        userGroups: ["B", "A"],
        displayGroup: MULTIPLE_GROUPS_SPECIFIED,
        place_types: [],
      },
    ]);

    expect(result.points[0].properties.user_groups).toEqual(["B", "A"]);
    expect(result.points[0].properties.marker_kind).toBe("default");
  });

  it("marks multiple-group places with the multiple marker kind", () => {
    const result = buildMapMarkers(
      [
        {
          id: "993",
          title: "Gallia",
          repr_lat: 46,
          repr_lng: 1,
          mappable: true,
          userGroups: ["A", "B"],
          displayGroup: MULTIPLE_GROUPS_SPECIFIED,
          place_types: ["region"],
        },
      ],
      () => ({
        kind: "multiple",
        color: SPECIAL_MARKER_COLOR,
      }),
    );

    expect(result.points[0].properties.marker_kind).toBe("multiple");
    expect(result.points[0].properties.color).toBe(SPECIAL_MARKER_COLOR);
  });

  it("marks unspecified-group places with the unspecified marker kind", () => {
    const result = buildMapMarkers(
      [
        {
          id: "993",
          title: "Gallia",
          repr_lat: 46,
          repr_lng: 1,
          mappable: true,
          userGroups: [],
          displayGroup: GROUP_NOT_SPECIFIED,
          place_types: ["region"],
        },
      ],
      () => ({
        kind: "unspecified",
        color: SPECIAL_MARKER_COLOR,
      }),
    );

    expect(result.points[0].properties.marker_kind).toBe("unspecified");
  });

  it("keeps co-located places as separate clusterable features", () => {
    const places = Array.from({ length: 5 }, (_, index) => ({
      id: String(index + 1),
      title: `[ Untitled ${index + 1} ]`,
      repr_lat: 45.5,
      repr_lng: 21.5,
      mappable: true,
      userGroups: [],
      displayGroup: null,
      place_types: ["settlement"],
    }));

    const result = buildMapMarkers(places);

    expect(result.points).toHaveLength(5);
    expect(result.points.every((feature) => typeof feature.id === "string")).toBe(true);
    expect(result.coincidentPoints[0].id).toMatch(/^coincident:/);
    expect(result.coordinates).toHaveLength(5);
    expect(result.points.every((feature) => feature.properties.coincident)).toBe(true);
    expect(result.points.map((feature) => feature.properties.pleiades_id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("builds one terminal marker for co-located places", () => {
    const places = Array.from({ length: 5 }, (_, index) => ({
      id: String(index + 1),
      title: `[ Untitled ${index + 1} ]`,
      repr_lat: 45.5,
      repr_lng: 21.5,
      mappable: true,
      userGroups: [],
      displayGroup: null,
      place_types: ["settlement"],
    }));

    const result = buildMapMarkers(places);

    expect(result.coincidentPoints).toHaveLength(1);
    expect(result.coincidentPoints[0].properties.place_count).toBe(5);

    const members = JSON.parse(
      result.coincidentPoints[0].properties.coincident_places,
    );
    expect(members.map((member) => member.id)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("collapses co-located highlight points to one coordinate", () => {
    const places = Array.from({ length: 5 }, (_, index) => ({
      id: String(index + 1),
      repr_lat: 45.5,
      repr_lng: 21.5,
      mappable: true,
    }));

    const highlights = buildHighlightMarkers(places);

    expect(highlights).toHaveLength(1);
    expect(highlights[0].geometry.coordinates).toEqual([21.5, 45.5]);
    expect(highlights[0].properties.place_count).toBe(5);
  });

  it("keeps distinct highlight coordinates separate", () => {
    const highlights = buildHighlightMarkers([
      { id: "1", repr_lat: 45.5, repr_lng: 21.5, mappable: true },
      { id: "2", repr_lat: 46.5, repr_lng: 22.5, mappable: true },
    ]);

    expect(highlights).toHaveLength(2);
  });

  it("adds temporal activity and Location/Name counts to markers", () => {
    const result = buildMapMarkers(
      [{ id: "1", title: "Temporal", repr_lat: 10, repr_lng: 20, mappable: true, place_types: [] }],
      undefined,
      () => ({ active: true, activeLocations: 2, activeNames: 3 }),
    );
    expect(result.points[0].properties).toMatchObject({
      temporal_active: true,
      active_locations: 2,
      active_names: 3,
      active_place_count: 1,
    });
  });

});
