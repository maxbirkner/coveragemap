import { TreemapGenerator } from "./treemapGenerator";
import { CoverageAnalysis } from "./coverageAnalyzer";
import * as fs from "fs";

// Mock dependencies that may not be installed
jest.mock("@resvg/resvg-wasm", () => ({
  initWasm: jest.fn().mockResolvedValue(undefined),
  Resvg: jest.fn().mockImplementation(() => ({
    render: jest.fn(() => ({
      asPng: jest.fn(() => Buffer.from("fake-png-data")),
    })),
  })),
}));

jest.mock("linkedom", () => ({
  parseHTML: jest.fn(() => ({
    document: {
      body: {
        innerHTML: "<svg>mock-svg-content</svg>",
        appendChild: jest.fn(),
      },
      createElement: jest.fn(() => ({
        setAttribute: jest.fn(),
        appendChild: jest.fn(),
      })),
    },
  })),
}));

jest.mock("d3", () => ({
  select: jest.fn(() => {
    const mockSelection = {
      append: jest.fn().mockReturnThis(),
      attr: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
    };
    return mockSelection;
  }),
}));

jest.mock("d3-hierarchy", () => ({
  hierarchy: jest.fn(() => ({
    sum: jest.fn(() => ({
      sort: jest.fn(() => ({
        leaves: jest.fn(() => []),
      })),
    })),
  })),
  treemap: jest.fn(() => {
    const mockTreemap: Record<string, any> = jest.fn();
    mockTreemap.size = jest.fn().mockReturnValue(mockTreemap);
    mockTreemap.padding = jest.fn().mockReturnValue(mockTreemap);
    return mockTreemap;
  }),
}));

jest.mock("fs");

const mockedFs = fs as jest.Mocked<typeof fs>;

describe("TreemapGenerator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("colorForCoverage", () => {
    it.each([
      { coverage: "full" as const, color: "#4ecdc4" },
      { coverage: "partial" as const, color: "#ffe66d" },
      { coverage: "none" as const, color: "#ff6b6b" },
    ])(
      "maps $coverage coverage to the $color palette colour",
      ({ coverage, color }) => {
        expect(TreemapGenerator.colorForCoverage(coverage)).toBe(color);
      },
    );
  });

  describe("formatTickerLines", () => {
    it("builds ticker rows with name, percentage and line count", () => {
      const result = TreemapGenerator.formatTickerLines({
        name: "example.ts::doWork",
        file: "src/example.ts",
        value: 10,
        coverage: "partial",
        lineCount: 10,
        coveredLines: 3,
        functionName: "doWork",
      });

      expect(result).toEqual({
        name: "example.ts › doWork",
        percent: "30%",
        lines: "3/10 lines",
      });
    });

    it("falls back to the file basename when no function name is set", () => {
      const result = TreemapGenerator.formatTickerLines({
        name: "script.ts",
        file: "src/nested/script.ts",
        value: 4,
        coverage: "full",
        lineCount: 4,
        coveredLines: 4,
      });

      expect(result.name).toBe("script.ts");
      expect(result.percent).toBe("100%");
      expect(result.lines).toBe("4/4 lines");
    });

    it("prefixes the function name with the file basename only", () => {
      const result = TreemapGenerator.formatTickerLines({
        name: "deep/path/widget.ts::render",
        file: "src/deep/path/widget.ts",
        value: 8,
        coverage: "partial",
        lineCount: 8,
        coveredLines: 6,
        functionName: "render",
      });

      expect(result.name).toBe("widget.ts › render");
    });

    it("reports 0% without dividing by zero for empty tiles", () => {
      const result = TreemapGenerator.formatTickerLines({
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

  describe("generateTreemapData", () => {
    it("should generate treemap data for files with coverage", () => {
      const mockAnalysis: CoverageAnalysis = {
        changeset: {
          baseCommit: "abc123",
          headCommit: "def456",
          targetBranch: "main",
          files: [],
          totalFiles: 1,
        },
        changedFiles: [
          {
            path: "src/example.ts",
            status: "modified",
            coverage: {
              path: "src/example.ts",
              functions: [
                {
                  name: "testFunction",
                  line: 10,
                  hit: 1,
                },
                {
                  name: "anotherFunction",
                  line: 20,
                  hit: 0,
                },
              ],
              lines: [
                { line: 10, hit: 1 },
                { line: 11, hit: 1 },
                { line: 12, hit: 0 },
                { line: 20, hit: 0 },
                { line: 21, hit: 0 },
              ],
              branches: [],
              summary: {
                functionsFound: 2,
                functionsHit: 1,
                linesFound: 5,
                linesHit: 2,
                branchesFound: 0,
                branchesHit: 0,
              },
            },
            analysis: {
              totalLines: 5,
              coveredLines: 2,
              totalFunctions: 2,
              coveredFunctions: 1,
              totalBranches: 0,
              coveredBranches: 0,
              linesCoveragePercentage: 40,
              functionsCoveragePercentage: 50,
              branchesCoveragePercentage: 0,
              overallCoveragePercentage: 40,
            },
          },
        ],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 5,
            coveredLines: 2,
            totalFunctions: 2,
            coveredFunctions: 1,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 40,
            functionsCoveragePercentage: 50,
            branchesCoveragePercentage: 0,
            overallCoveragePercentage: 40,
          },
        },
      };

      const result = TreemapGenerator.generateTreemapData(mockAnalysis);

      expect(result.name).toBe("Coverage Analysis");
      expect(result.children).toHaveLength(2); // Two functions

      const testFunction = result.children.find(
        (child) => child.name === "example.ts::testFunction",
      );
      expect(testFunction).toBeDefined();
      expect(testFunction?.coverage).toBe("partial"); // 2 out of 10 lines covered
      expect(testFunction?.functionName).toBe("testFunction");

      const anotherFunction = result.children.find(
        (child) => child.name === "example.ts::anotherFunction",
      );
      expect(anotherFunction).toBeDefined();
      expect(anotherFunction?.coverage).toBe("none"); // 0 lines covered
      expect(anotherFunction?.functionName).toBe("anotherFunction");
    });

    it("should handle files without coverage data", () => {
      const mockAnalysis: CoverageAnalysis = {
        changeset: {
          baseCommit: "abc123",
          headCommit: "def456",
          targetBranch: "main",
          files: [],
          totalFiles: 1,
        },
        changedFiles: [
          {
            path: "src/uncovered.ts",
            status: "added",
            coverage: undefined,
            analysis: {
              totalLines: 20,
              coveredLines: 0,
              totalFunctions: 0,
              coveredFunctions: 0,
              totalBranches: 0,
              coveredBranches: 0,
              linesCoveragePercentage: 0,
              functionsCoveragePercentage: 0,
              branchesCoveragePercentage: 0,
              overallCoveragePercentage: 0,
            },
          },
        ],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 0,
          filesWithoutCoverage: 1,
          overallCoverage: {
            totalLines: 20,
            coveredLines: 0,
            totalFunctions: 0,
            coveredFunctions: 0,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 0,
            functionsCoveragePercentage: 0,
            branchesCoveragePercentage: 0,
            overallCoveragePercentage: 0,
          },
        },
      };

      const result = TreemapGenerator.generateTreemapData(mockAnalysis);

      expect(result.children).toHaveLength(1);
      expect(result.children[0].name).toBe("uncovered.ts");
      expect(result.children[0].coverage).toBe("none");
      expect(result.children[0].value).toBe(20);
    });

    it("should handle files with coverage but no functions", () => {
      const mockAnalysis: CoverageAnalysis = {
        changeset: {
          baseCommit: "abc123",
          headCommit: "def456",
          targetBranch: "main",
          files: [],
          totalFiles: 1,
        },
        changedFiles: [
          {
            path: "src/script.ts",
            status: "modified",
            coverage: {
              path: "src/script.ts",
              functions: [], // No functions
              lines: [
                { line: 1, hit: 1 },
                { line: 2, hit: 1 },
                { line: 3, hit: 0 },
              ],
              branches: [],
              summary: {
                functionsFound: 0,
                functionsHit: 0,
                linesFound: 3,
                linesHit: 2,
                branchesFound: 0,
                branchesHit: 0,
              },
            },
            analysis: {
              totalLines: 3,
              coveredLines: 2,
              totalFunctions: 0,
              coveredFunctions: 0,
              totalBranches: 0,
              coveredBranches: 0,
              linesCoveragePercentage: 66.67,
              functionsCoveragePercentage: 0,
              branchesCoveragePercentage: 0,
              overallCoveragePercentage: 66.67,
            },
          },
        ],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 3,
            coveredLines: 2,
            totalFunctions: 0,
            coveredFunctions: 0,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 66.67,
            functionsCoveragePercentage: 0,
            branchesCoveragePercentage: 0,
            overallCoveragePercentage: 66.67,
          },
        },
      };

      const result = TreemapGenerator.generateTreemapData(mockAnalysis);

      expect(result.children).toHaveLength(1);
      expect(result.children[0].name).toBe("script.ts");
      expect(result.children[0].coverage).toBe("partial"); // 66.67%
      expect(result.children[0].functionName).toBeUndefined();
    });

    it("should mark a fully covered function as full", () => {
      const mockAnalysis: CoverageAnalysis = {
        changeset: {
          baseCommit: "abc123",
          headCommit: "def456",
          targetBranch: "main",
          files: [],
          totalFiles: 1,
        },
        changedFiles: [
          {
            path: "src/full.ts",
            status: "modified",
            coverage: {
              path: "src/full.ts",
              // Two functions so the first one's line range is bounded by the
              // second (lines 1..3), and every line in that range is hit.
              functions: [
                { name: "fullFn", line: 1, hit: 5 },
                { name: "tailFn", line: 4, hit: 1 },
              ],
              lines: [
                { line: 1, hit: 5 },
                { line: 2, hit: 5 },
                { line: 3, hit: 5 },
                { line: 4, hit: 1 },
              ],
              branches: [],
              summary: {
                functionsFound: 2,
                functionsHit: 2,
                linesFound: 4,
                linesHit: 4,
                branchesFound: 0,
                branchesHit: 0,
              },
            },
            analysis: {
              totalLines: 4,
              coveredLines: 4,
              totalFunctions: 2,
              coveredFunctions: 2,
              totalBranches: 0,
              coveredBranches: 0,
              linesCoveragePercentage: 100,
              functionsCoveragePercentage: 100,
              branchesCoveragePercentage: 0,
              overallCoveragePercentage: 100,
            },
          },
        ],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 4,
            coveredLines: 4,
            totalFunctions: 2,
            coveredFunctions: 2,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 100,
            functionsCoveragePercentage: 100,
            branchesCoveragePercentage: 0,
            overallCoveragePercentage: 100,
          },
        },
      };

      const result = TreemapGenerator.generateTreemapData(mockAnalysis);

      const fullFn = result.children.find(
        (child) => child.name === "full.ts::fullFn",
      );
      expect(fullFn?.coverage).toBe("full");
    });

    it.each([
      { percentage: 100, expected: "full" },
      { percentage: 0, expected: "none" },
    ])(
      "should map a function-less file at $percentage% to $expected",
      ({ percentage, expected }) => {
        const mockAnalysis: CoverageAnalysis = {
          changeset: {
            baseCommit: "abc123",
            headCommit: "def456",
            targetBranch: "main",
            files: [],
            totalFiles: 1,
          },
          changedFiles: [
            {
              path: "src/script.ts",
              status: "modified",
              coverage: {
                path: "src/script.ts",
                functions: [],
                lines: [{ line: 1, hit: percentage === 0 ? 0 : 1 }],
                branches: [],
                summary: {
                  functionsFound: 0,
                  functionsHit: 0,
                  linesFound: 1,
                  linesHit: percentage === 0 ? 0 : 1,
                  branchesFound: 0,
                  branchesHit: 0,
                },
              },
              analysis: {
                totalLines: 10,
                coveredLines: percentage === 0 ? 0 : 10,
                totalFunctions: 0,
                coveredFunctions: 0,
                totalBranches: 0,
                coveredBranches: 0,
                linesCoveragePercentage: percentage,
                functionsCoveragePercentage: 0,
                branchesCoveragePercentage: 0,
                overallCoveragePercentage: percentage,
              },
            },
          ],
          summary: {
            totalChangedFiles: 1,
            filesWithCoverage: 1,
            filesWithoutCoverage: 0,
            overallCoverage: {
              totalLines: 10,
              coveredLines: percentage === 0 ? 0 : 10,
              totalFunctions: 0,
              coveredFunctions: 0,
              totalBranches: 0,
              coveredBranches: 0,
              linesCoveragePercentage: percentage,
              functionsCoveragePercentage: 0,
              branchesCoveragePercentage: 0,
              overallCoveragePercentage: percentage,
            },
          },
        };

        const result = TreemapGenerator.generateTreemapData(mockAnalysis);

        expect(result.children).toHaveLength(1);
        expect(result.children[0].coverage).toBe(expected);
      },
    );
  });

  describe("generatePNG", () => {
    it("should attempt to generate PNG treemap", async () => {
      const mockAnalysis: CoverageAnalysis = {
        changeset: {
          baseCommit: "abc123",
          headCommit: "def456",
          targetBranch: "main",
          files: [],
          totalFiles: 1,
        },
        changedFiles: [
          {
            path: "src/example.ts",
            status: "modified",
            coverage: {
              path: "src/example.ts",
              functions: [{ name: "test", line: 1, hit: 1 }],
              lines: [{ line: 1, hit: 1 }],
              branches: [],
              summary: {
                functionsFound: 1,
                functionsHit: 1,
                linesFound: 1,
                linesHit: 1,
                branchesFound: 0,
                branchesHit: 0,
              },
            },
            analysis: {
              totalLines: 1,
              coveredLines: 1,
              totalFunctions: 1,
              coveredFunctions: 1,
              totalBranches: 0,
              coveredBranches: 0,
              linesCoveragePercentage: 100,
              functionsCoveragePercentage: 100,
              branchesCoveragePercentage: 0,
              overallCoveragePercentage: 100,
            },
          },
        ],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 1,
            coveredLines: 1,
            totalFunctions: 1,
            coveredFunctions: 1,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 100,
            functionsCoveragePercentage: 100,
            branchesCoveragePercentage: 0,
            overallCoveragePercentage: 100,
          },
        },
      };

      mockedFs.writeFileSync.mockImplementation(() => {});

      // This will likely throw because dependencies aren't installed,
      // but we can test that it attempts to generate
      const result = await TreemapGenerator.generatePNG(mockAnalysis);

      expect(result).toBe("./coverage-treemap.png");
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
    });
  });
});
