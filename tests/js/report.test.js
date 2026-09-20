import { describe, expect, it } from "vitest";

import { formatIdList, truncateDiagnosticValue } from "../../static/js/widgets/report.js";

describe("formatIdList", () => {
  it("formats short ID lists", () => {
    expect(formatIdList(["1", "2", "3"])).toBe("1, 2, 3");
  });

  it("truncates long ID lists", () => {
    expect(formatIdList(["1", "2", "3", "4"], 2)).toBe("1, 2, ... and 2 more");
  });
});


describe("truncateDiagnosticValue", () => {
  it("keeps short diagnostic values unchanged", () => {
    expect(truncateDiagnosticValue("not-an-id", 20)).toBe("not-an-id");
  });

  it("truncates very long diagnostic values for display", () => {
    const result = truncateDiagnosticValue("x".repeat(300), 40);
    expect(result).toHaveLength(40);
    expect(result.endsWith("…")).toBe(true);
  });
});
