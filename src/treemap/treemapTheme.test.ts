import { colorForCoverage } from "./treemapTheme";

describe("colorForCoverage", () => {
  it.each([
    { coverage: "full" as const, color: "#4ecdc4" },
    { coverage: "partial" as const, color: "#ffe66d" },
    { coverage: "none" as const, color: "#ff6b6b" },
  ])(
    "maps $coverage coverage to the $color palette colour",
    ({ coverage, color }) => {
      expect(colorForCoverage(coverage)).toBe(color);
    },
  );
});
