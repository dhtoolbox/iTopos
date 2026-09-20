import { describe, expect, it } from "vitest";
import {
  createPlacePopupHTML,
  escapeHTML,
  getPopupData,
  setTemporalPopupState,
} from "../../static/js/widgets/place-popup.js";
import {
  GROUP_NOT_SPECIFIED,
  MULTIPLE_GROUPS_SPECIFIED,
  NOT_SPECIFIED,
} from "../../static/js/constants.js";

describe("getPopupData", () => {
  it("reads marker properties", () => {
    const data = getPopupData({
      pleiades_id: "579885",
      title: "Athens",
      color: "#123456",
      display_group: "Cities",
      user_groups: ["Cities"],
      place_types: ["settlement"],
      place_type_keys: ["settlement"],
    });

    expect(data).toEqual({
      id: "579885",
      title: "Athens",
      color: "#123456",
      displayGroup: "Cities",
      userGroups: ["Cities"],
      placeTypes: ["settlement"],
      placeTypeKeys: ["settlement"],
      reprLat: null,
      reprLng: null,
    });
  });

  it("decodes arrays stringified by MapLibre", () => {
    const data = getPopupData({
      user_groups: '["B","A"]',
      place_types: '["settlement","port"]',
    });

    expect(data.userGroups).toEqual(["B", "A"]);

    expect(data.placeTypes).toEqual(["settlement", "port"]);
  });
});

describe("createPlacePopupHTML", () => {
  it("shows one user-defined group", () => {
    const html = createPlacePopupHTML({
      pleiades_id: "579885",
      title: "Athens",
      display_group: "Cities",
      user_groups: '["Cities"]',
      place_types: "[]",
    });

    expect(html).toContain('class="place-popup__label">GROUP</span>');

    expect(html).toContain("Cities");
  });

  it("shows all user groups for a multiple-group place", () => {
    const html = createPlacePopupHTML({
      pleiades_id: "579885",
      title: "Athens",

      display_group: MULTIPLE_GROUPS_SPECIFIED,

      user_groups: '["B","A"]',
      place_types: "[]",
    });

    expect(html).toContain('class="place-popup__label">GROUPS</span>');

    expect(html).toContain('data-group="B"');

    expect(html).toContain('data-group="A"');

    expect(html).toContain(">B<");
    expect(html).toContain(">A<");
    expect(html).toContain("special-marker");
    expect(html).toContain(">#</span>");
  });

  it("shows group not specified", () => {
    const html = createPlacePopupHTML({
      pleiades_id: "579885",
      title: "Athens",

      display_group: GROUP_NOT_SPECIFIED,

      user_groups: "[]",
      place_types: "[]",
    });

    expect(html).toContain(NOT_SPECIFIED);
  });

  it("omits group information when grouping does not apply", () => {
    const html = createPlacePopupHTML({
      pleiades_id: "579885",
      title: "Athens",
      display_group: null,
      user_groups: "[]",
      place_types: "[]",
    });

    expect(html).not.toContain('class="place-popup__label">GROUP</span>');

    expect(html).not.toContain('class="place-popup__label">GROUPS</span>');
  });

  it("delimits multiple place types and groups compactly", () => {
    const html = createPlacePopupHTML({
      pleiades_id: "579885",
      title: "Athens",
      display_group: MULTIPLE_GROUPS_SPECIFIED,
      user_groups: '["B","A"]',
      place_types: '["settlement","port"]',
    });

    expect(html).toContain('class="place-popup__label">FEATURE CATEGORIES</span>');
    expect(html).toContain("place-popup__delimiter");
    expect(html).toContain('data-group="B"');
    expect(html).toContain('data-group="A"');
  });

  it("links place types to Pleiades", () => {
    const html = createPlacePopupHTML({
      pleiades_id: "579885",
      title: "Athens",
      display_group: null,
      user_groups: "[]",
      place_types: '["settlement"]',
    });

    expect(html).toContain(
      "https://pleiades.stoa.org/" + "vocabularies/place-types/" + "settlement",
    );
  });
  it("renders a compact temporal evidence matrix with Location and Name icons", () => {
    setTemporalPopupState({
      periods: [["roman", "Roman, early Empire (30 BC-AD 300)", -30, 300]],
      confidences: ["confident"],
      placeEvidence: new Map([
        [
          "579885",
          {
            active: true,
            activeLocations: 2,
            activeNames: 1,
            totalLocations: 2,
            totalNames: 3,
            temporalRows: [
              {
                periodIndex: 0,
                term: "Roman, early Empire (30 BC-AD 300)",
                start: -30,
                end: 300,
                selected: true,
                confidences: [
                  {
                    confidenceIndex: 0,
                    confidence: "confident",
                    allowed: true,
                    locations: 2,
                    names: 1,
                  },
                ],
              },
            ],
          },
        ],
      ]),
    });
    const html = createPlacePopupHTML({
      pleiades_id: "579885",
      title: "Athens",
      repr_lat: 37.97,
      repr_lng: 23.72,
      place_types: '["settlement"]',
      place_type_keys: '["settlement"]',
      user_groups: "[]",
    });
    expect(html).toContain("TEMPORAL EVIDENCE");
    expect(html).toContain("Roman, early Empire");
    expect(html).toContain("location-arrow.svg");
    expect(html).toContain("tag.svg");
    expect(html).toContain("37.97, 23.72");
  });

  it("keeps temporal evidence visible when no temporal period is selected", () => {
    setTemporalPopupState({
      periods: [["roman", "Roman, early Empire (30 BC-AD 300)", -30, 300]],
      confidences: ["confident"],
      filteringDisabled: true,
      placeEvidence: new Map([
        [
          "579885",
          {
            active: false,
            activeLocations: 0,
            activeNames: 0,
            totalLocations: 2,
            totalNames: 3,
            temporalRows: [
              {
                periodIndex: 0,
                term: "Roman, early Empire (30 BC-AD 300)",
                start: -30,
                end: 300,

                // Deliberately true: filteringDisabled must suppress
                // highlighting even if the remembered selection remains.
                selected: true,

                confidences: [
                  {
                    confidenceIndex: 0,
                    confidence: "confident",
                    allowed: true,
                    locations: 2,
                    names: 1,
                  },
                ],
              },
            ],
          },
        ],
      ]),
    });
    const html = createPlacePopupHTML({
      pleiades_id: "579885",
      title: "Athens",
      repr_lat: 37.97,
      repr_lng: 23.72,
      place_types: '["settlement"]',
      place_type_keys: '["settlement"]',
      user_groups: "[]",
    });
    expect(html).toContain("TEMPORAL EVIDENCE");
    expect(html).toContain("Roman, early Empire");
    expect(html).not.toContain('class="is-selected"');
  });
});

describe("escapeHTML", () => {
  it("escapes user-controlled text", () => {
    expect(escapeHTML('<script>"hello" & goodbye</script>')).not.toContain("<script>");
  });
});
