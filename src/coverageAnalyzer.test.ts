import { CoverageAnalyzer } from "./coverageAnalyzer";
import { ChangesetUtils } from "./changeset";
import { LcovReport, FileCoverage } from "./lcov";

describe("CoverageAnalyzer", () => {
  const mockFileCoverage: FileCoverage = {
    path: "src/example.ts",
    functions: [
      { name: "coveredFunction", line: 5, hit: 3 },
      { name: "uncoveredFunction", line: 10, hit: 0 },
    ],
    lines: [
      { line: 1, hit: 1 },
      { line: 2, hit: 0 },
      { line: 5, hit: 3 },
      { line: 10, hit: 0 },
    ],
    branches: [
      { line: 1, block: 0, branch: 0, taken: 1 },
      { line: 1, block: 0, branch: 1, taken: 0 },
    ],
    summary: {
      functionsFound: 2,
      functionsHit: 1,
      linesFound: 4,
      linesHit: 2,
      branchesFound: 2,
      branchesHit: 1,
    },
  };

  const mockLcovReport: LcovReport = {
    files: new Map([["src/example.ts", mockFileCoverage]]),
    summary: {
      totalFiles: 1,
      functionsFound: 2,
      functionsHit: 1,
      linesFound: 4,
      linesHit: 2,
      branchesFound: 2,
      branchesHit: 1,
    },
  };

  describe("analyze", () => {
    it("should analyze coverage for changed files", () => {
      const changeset = ChangesetUtils.createChangeset(
        ["src/example.ts", "src/uncovered.ts"],
        "abc123",
        "def456",
        "main",
      );

      const analysis = CoverageAnalyzer.analyze(changeset, mockLcovReport);

      expect(analysis.changedFiles).toHaveLength(2);
      expect(analysis.summary.totalChangedFiles).toBe(2);
      expect(analysis.summary.filesWithCoverage).toBe(1);
      expect(analysis.summary.filesWithoutCoverage).toBe(1);

      // File with coverage
      const coveredFile = analysis.changedFiles[0];
      expect(coveredFile.path).toBe("src/example.ts");
      expect(coveredFile.coverage).toBeDefined();
      expect(coveredFile.analysis.totalLines).toBe(4);
      expect(coveredFile.analysis.coveredLines).toBe(2);
      expect(coveredFile.analysis.totalFunctions).toBe(2);
      expect(coveredFile.analysis.coveredFunctions).toBe(1);
      expect(coveredFile.analysis.linesCoveragePercentage).toBe(50);
      expect(coveredFile.analysis.functionsCoveragePercentage).toBe(50);

      // File without coverage
      const uncoveredFile = analysis.changedFiles[1];
      expect(uncoveredFile.path).toBe("src/uncovered.ts");
      expect(uncoveredFile.coverage).toBeUndefined();
      expect(uncoveredFile.analysis.totalLines).toBe(0);
      expect(uncoveredFile.analysis.overallCoveragePercentage).toBe(0);
    });

    it("should calculate overall coverage correctly", () => {
      const changeset = ChangesetUtils.createChangeset(
        ["src/example.ts"],
        "abc123",
        "def456",
        "main",
      );

      const analysis = CoverageAnalyzer.analyze(changeset, mockLcovReport);

      expect(analysis.summary.overallCoverage.totalLines).toBe(4);
      expect(analysis.summary.overallCoverage.coveredLines).toBe(2);
      expect(analysis.summary.overallCoverage.totalFunctions).toBe(2);
      expect(analysis.summary.overallCoverage.coveredFunctions).toBe(1);
      expect(analysis.summary.overallCoverage.totalBranches).toBe(2);
      expect(analysis.summary.overallCoverage.coveredBranches).toBe(1);

      // Overall coverage: (2 lines + 1 function + 1 branch) / (4 lines + 2 functions + 2 branches) = 4/8 = 50%
      expect(analysis.summary.overallCoverage.overallCoveragePercentage).toBe(
        50,
      );
    });
  });

  describe("getUncoveredFunctions", () => {
    it("should return uncovered functions for changed files", () => {
      const changeset = ChangesetUtils.createChangeset(
        ["src/example.ts"],
        "abc123",
        "def456",
        "main",
      );

      const analysis = CoverageAnalyzer.analyze(changeset, mockLcovReport);
      const uncoveredFunctions =
        CoverageAnalyzer.getUncoveredFunctions(analysis);

      expect(uncoveredFunctions).toHaveLength(1);
      expect(uncoveredFunctions[0].file).toBe("src/example.ts");
      expect(uncoveredFunctions[0].functions).toHaveLength(1);
      expect(uncoveredFunctions[0].functions[0].name).toBe("uncoveredFunction");
    });

    it("should return empty array when all functions are covered", () => {
      const fullyCoveredFile: FileCoverage = {
        ...mockFileCoverage,
        functions: [{ name: "coveredFunction", line: 5, hit: 3 }],
        summary: {
          ...mockFileCoverage.summary,
          functionsFound: 1,
          functionsHit: 1,
        },
      };

      const lcovReport: LcovReport = {
        files: new Map([["src/example.ts", fullyCoveredFile]]),
        summary: mockLcovReport.summary,
      };

      const changeset = ChangesetUtils.createChangeset(
        ["src/example.ts"],
        "abc123",
        "def456",
        "main",
      );

      const analysis = CoverageAnalyzer.analyze(changeset, lcovReport);
      const uncoveredFunctions =
        CoverageAnalyzer.getUncoveredFunctions(analysis);

      expect(uncoveredFunctions).toHaveLength(0);
    });
  });

  describe("getUncoveredLines", () => {
    it("should return uncovered lines for changed files", () => {
      const changeset = ChangesetUtils.createChangeset(
        ["src/example.ts"],
        "abc123",
        "def456",
        "main",
      );

      const analysis = CoverageAnalyzer.analyze(changeset, mockLcovReport);
      const uncoveredLines = CoverageAnalyzer.getUncoveredLines(analysis);

      expect(uncoveredLines).toHaveLength(1);
      expect(uncoveredLines[0].file).toBe("src/example.ts");
      expect(uncoveredLines[0].lines).toEqual([2, 10]);
    });
  });

  describe("meetsCoverageThreshold", () => {
    it("should return true when coverage meets threshold", () => {
      const changeset = ChangesetUtils.createChangeset(
        ["src/example.ts"],
        "abc123",
        "def456",
        "main",
      );

      const analysis = CoverageAnalyzer.analyze(changeset, mockLcovReport);

      expect(CoverageAnalyzer.meetsCoverageThreshold(analysis, 40)).toBe(true);
      expect(CoverageAnalyzer.meetsCoverageThreshold(analysis, 50)).toBe(true);
    });

    it("should return false when coverage does not meet threshold", () => {
      const changeset = ChangesetUtils.createChangeset(
        ["src/example.ts"],
        "abc123",
        "def456",
        "main",
      );

      const analysis = CoverageAnalyzer.analyze(changeset, mockLcovReport);

      expect(CoverageAnalyzer.meetsCoverageThreshold(analysis, 60)).toBe(false);
      expect(CoverageAnalyzer.meetsCoverageThreshold(analysis, 80)).toBe(false);
    });

    describe("threshold = 0 behavior", () => {
      it("should return true when PR coverage equals overall project coverage", () => {
        const changeset = ChangesetUtils.createChangeset(
          ["src/example.ts"],
          "abc123",
          "def456",
          "main",
        );

        const analysis = CoverageAnalyzer.analyze(changeset, mockLcovReport);
        // PR coverage is 50%, overall project coverage is 50% (2/4 lines)
        const overallProjectCoverage = 50;

        expect(
          CoverageAnalyzer.meetsCoverageThreshold(
            analysis,
            0,
            overallProjectCoverage,
          ),
        ).toBe(true);
      });

      it("should return true when PR coverage is higher than overall project coverage", () => {
        const changeset = ChangesetUtils.createChangeset(
          ["src/example.ts"],
          "abc123",
          "def456",
          "main",
        );

        const analysis = CoverageAnalyzer.analyze(changeset, mockLcovReport);
        // PR coverage is 50%, overall project coverage is 40%
        const overallProjectCoverage = 40;

        expect(
          CoverageAnalyzer.meetsCoverageThreshold(
            analysis,
            0,
            overallProjectCoverage,
          ),
        ).toBe(true);
      });

      it("should return false when PR coverage is lower than overall project coverage", () => {
        const changeset = ChangesetUtils.createChangeset(
          ["src/example.ts"],
          "abc123",
          "def456",
          "main",
        );

        const analysis = CoverageAnalyzer.analyze(changeset, mockLcovReport);
        // PR coverage is 50%, overall project coverage is 60%
        const overallProjectCoverage = 60;

        expect(
          CoverageAnalyzer.meetsCoverageThreshold(
            analysis,
            0,
            overallProjectCoverage,
          ),
        ).toBe(false);
      });

      it("should throw error when threshold is 0 but overall project coverage is not provided", () => {
        const changeset = ChangesetUtils.createChangeset(
          ["src/example.ts"],
          "abc123",
          "def456",
          "main",
        );

        const analysis = CoverageAnalyzer.analyze(changeset, mockLcovReport);

        expect(() => {
          CoverageAnalyzer.meetsCoverageThreshold(analysis, 0);
        }).toThrow(
          "Overall project coverage must be provided when threshold is 0",
        );
      });
    });
  });

  describe("format", () => {
    it("should format coverage analysis as readable string", () => {
      const changeset = ChangesetUtils.createChangeset(
        ["src/example.ts"],
        "abc123",
        "def456",
        "main",
      );

      const analysis = CoverageAnalyzer.analyze(changeset, mockLcovReport);
      const formatted = CoverageAnalyzer.format(analysis);

      expect(formatted).toContain("📊 Coverage Analysis for Changed Files");
      expect(formatted).toContain("📁 Files analyzed: 1");
      expect(formatted).toContain("✅ Files with coverage: 1");
      expect(formatted).toContain("Lines: 2/4 (50%)");
      expect(formatted).toContain("Functions: 1/2 (50%)");
      expect(formatted).toContain("Overall: 50%");
      expect(formatted).toContain("src/example.ts (50%)");
      expect(formatted).toContain("🔸 Uncovered functions: uncoveredFunction");
      expect(formatted).toContain("🔸 Uncovered lines: 2, 10");
    });
  });
});
