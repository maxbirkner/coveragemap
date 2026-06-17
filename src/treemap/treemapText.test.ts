import { formatTickerLines, wrapText } from "./treemapText";

describe("formatTickerLines", () => {
  it("builds ticker rows with name, percentage and line count", () => {
    const result = formatTickerLines({
      name: "doWork",
      file: "src/example.ts",
      value: 10,
      coverage: "partial",
      lineCount: 10,
      coveredLines: 3,
      functionName: "doWork",
    });

    expect(result).toEqual({
      name: "doWork",
      percent: "30%",
      lines: "3/10 lines",
    });
  });

  it("returns an empty name for file-level tiles without a function", () => {
    const result = formatTickerLines({
      name: "script.ts",
      file: "src/nested/script.ts",
      value: 4,
      coverage: "full",
      lineCount: 4,
      coveredLines: 4,
    });

    expect(result.name).toBe("");
    expect(result.percent).toBe("100%");
    expect(result.lines).toBe("4/4 lines");
  });

  it("uses the function name verbatim without a file prefix", () => {
    const result = formatTickerLines({
      name: "render",
      file: "src/deep/path/widget.ts",
      value: 8,
      coverage: "partial",
      lineCount: 8,
      coveredLines: 6,
      functionName: "render",
    });

    expect(result.name).toBe("render");
  });

  it("reports 0% without dividing by zero for empty tiles", () => {
    const result = formatTickerLines({
      name: "empty.ts",
      file: "src/empty.ts",
      value: 1,
      coverage: "none",
      lineCount: 0,
      coveredLines: 0,
    });

    expect(result.percent).toBe("0%");
    expect(result.lines).toBe("0/0 lines");
  });
});

describe("wrapText", () => {
  const PIXELS_PER_CHAR = 7;

  it("returns the text unchanged when it already fits", () => {
    expect(wrapText("doWork", 200, 2)).toEqual(["doWork"]);
  });

  it("wraps a long camelCase name onto multiple lines that each fit", () => {
    const maxWidth = 70; // ~10 characters per line
    const lines = wrapText("handleUserAuthentication", maxWidth, 3);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(
        Math.floor(maxWidth / PIXELS_PER_CHAR),
      );
    }
    // The whole name is preserved across the lines (no characters dropped).
    expect(lines.join("")).toBe("handleUserAuthentication");
  });

  it("breaks file paths on separators", () => {
    const lines = wrapText("src/deep/nested/widget.ts", 70, 4);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("src/deep/nested/widget.ts");
  });

  it("hard-splits unbreakable tokens with no natural boundaries", () => {
    const maxWidth = 70; // 10 characters per line
    const lines = wrapText("a".repeat(25), maxWidth, 5);

    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(10);
    }
    expect(lines.join("")).toBe("a".repeat(25));
  });

  it("ends the final line with an ellipsis once the content exceeds maxLines", () => {
    const lines = wrapText("a".repeat(60), 70, 2);

    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("...")).toBe(true);
    // The cut-off line never exceeds the available width.
    expect(lines[1].length).toBeLessThanOrEqual(10);
  });
});
