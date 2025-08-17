import { TreemapGenerator } from "./treemapGenerator";
import { CoverageAnalysis } from "./coverageAnalyzer";
import * as fs from "fs";

// Mock dependencies that may not be installed
jest.mock("sharp", () => {
  return jest.fn(() => ({
    png: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from("fake-png-data")),
  }));
});

jest.mock("jsdom", () => ({
  JSDOM: jest.fn(() => ({
    window: {
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
    // Mock global assignments
    (global as Record<string, any>).document = {};
    (global as Record<string, any>).window = {};
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
