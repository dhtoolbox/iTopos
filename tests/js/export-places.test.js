import { describe, expect, it } from "vitest";
import { buildCsvExport, buildJsonExport, validateExportColumns } from "../../static/js/widgets/export-places.js";

const dataset = { places: [
  { id: "1", title: 'Alpha, "Place"', repr_lat: 1.5, repr_lng: 2.5, place_types: ["settlement", "sanctuary, religious"], place_type_keys: ["settlement", "sanctuary"], userGroups: ["A", "B"] },
  { id: "2", title: "Beta", repr_lat: 3, repr_lng: 4, place_types: ["port"], place_type_keys: ["port"], userGroups: [] },
]};
const cols = [
  { key: "id", label: "ID", defaultName: "id", selected: true },
  { key: "title", label: "Title", defaultName: "title", selected: true },
  { key: "place_types", label: "Types", defaultName: "feature_categories", selected: true, csvMulti: true },
  { key: "groups", label: "Groups", defaultName: "group", selected: true },
];

describe("mapped Place export", () => {
  it("emits one CSV row per Place and Group and semicolon-separates multivalues", () => {
    const csv = buildCsvExport(dataset, cols);
    expect(csv.startsWith("id,title,feature_categories,group")).toBe(true);
    expect(csv).toContain('1,"Alpha, ""Place""","settlement; sanctuary, religious",A');
    expect(csv).toContain('1,"Alpha, ""Place""","settlement; sanctuary, religious",B');
    expect(csv).toContain('2,Beta,"port",');
  });

  it("preserves arrays in JSON and one object per Place", () => {
    const json = buildJsonExport(dataset, cols);
    expect(json).toHaveLength(2);
    expect(json[0]).toEqual({ id: "1", title: 'Alpha, "Place"', feature_categories: ["settlement", "sanctuary, religious"], group: ["A", "B"] });
  });

  it("requires at least one selected field", () => {
    expect(validateExportColumns(cols)).toBe("");
    expect(validateExportColumns(cols.map((column) => ({ ...column, selected: false })))).toMatch(/at least one/i);
  });
});
