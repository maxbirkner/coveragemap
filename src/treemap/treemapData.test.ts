import { generateTreemapData } from "./treemapData";
import { CoverageAnalysis } from "../coverageAnalyzer";

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
              { name: "testFunction", line: 10, hit: 1 },
              { name: "anotherFunction", line: 20, hit: 0 },
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

    const result = generateTreemapData(mockAnalysis);

    expect(result.name).toBe("Coverage Analysis");
    expect(result.children).toHaveLength(1); // One file group

    const fileGroup = result.children[0];
    expect(fileGroup.name).toBe("example.ts");
    expect(fileGroup.file).toBe("src/example.ts");
    expect(fileGroup.children).toHaveLength(2); // Two functions

    const testFunction = fileGroup.children.find(
      (child) => child.name === "testFunction",
    );
    expect(testFunction).toBeDefined();
    expect(testFunction?.coverage).toBe("partial"); // 2 out of 10 lines covered
    expect(testFunction?.functionName).toBe("testFunction");

    const anotherFunction = fileGroup.children.find(
      (child) => child.name === "anotherFunction",
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

    const result = generateTreemapData(mockAnalysis);

    expect(result.children).toHaveLength(1);
    expect(result.children[0].name).toBe("uncovered.ts");
    const uncoveredTile = result.children[0].children[0];
    expect(uncoveredTile.name).toBe("uncovered.ts");
    expect(uncoveredTile.coverage).toBe("none");
    expect(uncoveredTile.value).toBe(20);
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

    const result = generateTreemapData(mockAnalysis);

    expect(result.children).toHaveLength(1);
    expect(result.children[0].name).toBe("script.ts");
    const scriptTile = result.children[0].children[0];
    expect(scriptTile.coverage).toBe("partial"); // 66.67%
    expect(scriptTile.functionName).toBeUndefined();
  });

  it("omits instrumented files that have no coverable code", () => {
    // A normalized V8 (empty-report) file: coverage is present but empty, so
    // there is nothing meaningful to draw. It must not produce a tile.
    const mockAnalysis: CoverageAnalysis = {
      changeset: {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [],
        totalFiles: 2,
      },
      changedFiles: [
        {
          path: "src/types.ts",
          status: "modified",
          coverage: {
            path: "src/types.ts",
            functions: [],
            lines: [],
            branches: [],
            summary: {
              functionsFound: 0,
              functionsHit: 0,
              linesFound: 0,
              linesHit: 0,
              branchesFound: 0,
              branchesHit: 0,
            },
          },
          analysis: {
            totalLines: 0,
            coveredLines: 0,
            totalFunctions: 0,
            coveredFunctions: 0,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 100,
            functionsCoveragePercentage: 100,
            branchesCoveragePercentage: 100,
            overallCoveragePercentage: 100,
          },
        },
        {
          path: "src/real.ts",
          status: "modified",
          coverage: {
            path: "src/real.ts",
            functions: [],
            lines: [{ line: 1, hit: 1 }],
            branches: [],
            summary: {
              functionsFound: 0,
              functionsHit: 0,
              linesFound: 1,
              linesHit: 1,
              branchesFound: 0,
              branchesHit: 0,
            },
          },
          analysis: {
            totalLines: 1,
            coveredLines: 1,
            totalFunctions: 0,
            coveredFunctions: 0,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 100,
            functionsCoveragePercentage: 100,
            branchesCoveragePercentage: 100,
            overallCoveragePercentage: 100,
          },
        },
      ],
      summary: {
        totalChangedFiles: 2,
        filesWithCoverage: 2,
        filesWithoutCoverage: 0,
        overallCoverage: {
          totalLines: 1,
          coveredLines: 1,
          totalFunctions: 0,
          coveredFunctions: 0,
          totalBranches: 0,
          coveredBranches: 0,
          linesCoveragePercentage: 100,
          functionsCoveragePercentage: 100,
          branchesCoveragePercentage: 100,
          overallCoveragePercentage: 100,
        },
      },
    };

    const result = generateTreemapData(mockAnalysis);

    expect(result.children).toHaveLength(1);
    expect(result.children[0].name).toBe("real.ts");
  });

  it("still shows uninstrumented files (no coverage object) as tiles", () => {
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
          path: "src/missing.ts",
          status: "added",
          coverage: undefined,
          analysis: {
            totalLines: 0,
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
          totalLines: 0,
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

    const result = generateTreemapData(mockAnalysis);

    expect(result.children).toHaveLength(1);
    expect(result.children[0].children[0].coverage).toBe("none");
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

    const result = generateTreemapData(mockAnalysis);

    const fullFn = result.children[0].children.find(
      (child) => child.name === "fullFn",
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

      const result = generateTreemapData(mockAnalysis);

      expect(result.children).toHaveLength(1);
      expect(result.children[0].children[0].coverage).toBe(expected);
    },
  );
});
