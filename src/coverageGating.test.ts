import { CoverageGating, GatingResult } from "./coverageGating";
import { CoverageAnalysis } from "./coverageAnalyzer";
import { LcovReport } from "./lcov";

describe("CoverageGating", () => {
  const mockLcovReport: LcovReport = {
    files: new Map(),
    summary: {
      totalFiles: 10,
      linesFound: 1000,
      linesHit: 800, // 80% overall coverage
      functionsFound: 100,
      functionsHit: 85,
      branchesFound: 50,
      branchesHit: 40,
    },
  };

  const createMockAnalysis = (prCoverage: number): CoverageAnalysis => ({
    changeset: {
      baseCommit: "abc123",
      headCommit: "def456",
      targetBranch: "main",
      files: [],
      totalFiles: 0,
    },
    changedFiles: [],
    summary: {
      totalChangedFiles: 1,
      filesWithCoverage: 1,
      filesWithoutCoverage: 0,
      overallCoverage: {
        totalLines: 100,
        coveredLines: prCoverage,
        totalFunctions: 10,
        coveredFunctions: Math.floor(prCoverage / 10),
        totalBranches: 20,
        coveredBranches: Math.floor(prCoverage / 5),
        linesCoveragePercentage: prCoverage,
        functionsCoveragePercentage: prCoverage,
        branchesCoveragePercentage: prCoverage,
        overallCoveragePercentage: prCoverage,
      },
    },
  });

  describe("evaluate", () => {
    describe("standard threshold mode", () => {
      it("should return success when PR coverage meets threshold", () => {
        const analysis = createMockAnalysis(85);
        const result = CoverageGating.evaluate(
          analysis,
          mockLcovReport,
          "threshold",
          80,
        );

        expect(result).toEqual({
          meetsThreshold: true,
          threshold: 80,
          mode: "standard",
          prCoveragePercentage: 85,
          overallProjectCoveragePercentage: 80,
          description: "✅ PR coverage (85%) meets or exceeds threshold (80%)",
          errorMessage: undefined,
        });
      });

      it("should return failure when PR coverage is below threshold", () => {
        const analysis = createMockAnalysis(75);
        const result = CoverageGating.evaluate(
          analysis,
          mockLcovReport,
          "threshold",
          80,
        );

        expect(result).toEqual({
          meetsThreshold: false,
          threshold: 80,
          mode: "standard",
          prCoveragePercentage: 75,
          overallProjectCoveragePercentage: 80,
          description: "❌ PR coverage (75%) is below threshold (80%)",
          errorMessage:
            "Coverage gating failed: PR changes coverage (75%) is below threshold (80%)",
        });
      });

      it("should return success when PR coverage exactly meets threshold", () => {
        const analysis = createMockAnalysis(80);
        const result = CoverageGating.evaluate(
          analysis,
          mockLcovReport,
          "threshold",
          80,
        );

        expect(result.meetsThreshold).toBe(true);
        expect(result.prCoveragePercentage).toBe(80);
        expect(result.threshold).toBe(80);
      });
    });

    describe("baseline mode", () => {
      it("should return success when PR coverage meets overall project coverage", () => {
        const analysis = createMockAnalysis(85);
        const result = CoverageGating.evaluate(
          analysis,
          mockLcovReport,
          "baseline",
          0,
        );

        expect(result).toEqual({
          meetsThreshold: true,
          threshold: 0,
          mode: "baseline",
          prCoveragePercentage: 85,
          overallProjectCoveragePercentage: 80,
          description:
            "✅ PR coverage (85%) meets or exceeds overall project coverage (80%)",
          errorMessage: undefined,
        });
      });

      it("should return failure when PR coverage is below overall project coverage", () => {
        const analysis = createMockAnalysis(75);
        const result = CoverageGating.evaluate(
          analysis,
          mockLcovReport,
          "baseline",
          0,
        );

        expect(result).toEqual({
          meetsThreshold: false,
          threshold: 0,
          mode: "baseline",
          prCoveragePercentage: 75,
          overallProjectCoveragePercentage: 80,
          description:
            "❌ PR coverage (75%) is below overall project coverage (80%)",
          errorMessage:
            "Coverage gating failed: PR changes coverage (75%) is lower than overall project coverage (80%)",
        });
      });

      it("should return success when PR coverage exactly matches overall project coverage", () => {
        const analysis = createMockAnalysis(80);
        const result = CoverageGating.evaluate(
          analysis,
          mockLcovReport,
          "baseline",
          0,
        );

        expect(result.meetsThreshold).toBe(true);
        expect(result.prCoveragePercentage).toBe(80);
        expect(result.overallProjectCoveragePercentage).toBe(80);
      });
    });

    describe("none mode (gating disabled)", () => {
      it("should always pass and report disabled mode even below threshold", () => {
        const analysis = createMockAnalysis(10);
        const result = CoverageGating.evaluate(
          analysis,
          mockLcovReport,
          "none",
          80,
        );

        expect(result).toEqual({
          meetsThreshold: true,
          threshold: 80,
          mode: "disabled",
          prCoveragePercentage: 10,
          overallProjectCoveragePercentage: 80,
          description:
            "ℹ️ Coverage gating disabled — PR coverage (10%) is not enforced",
          errorMessage: undefined,
        });
      });
    });

    describe("edge cases", () => {
      it("should handle zero lines in project coverage", () => {
        const emptyLcovReport: LcovReport = {
          files: new Map(),
          summary: {
            totalFiles: 0,
            linesFound: 0,
            linesHit: 0,
            functionsFound: 0,
            functionsHit: 0,
            branchesFound: 0,
            branchesHit: 0,
          },
        };

        const analysis = createMockAnalysis(50);
        const result = CoverageGating.evaluate(
          analysis,
          emptyLcovReport,
          "baseline",
          0,
        );

        expect(result.meetsThreshold).toBe(false);
        expect(result.overallProjectCoveragePercentage).toBe(100);
        expect(result.prCoveragePercentage).toBe(50);
      });
    });
  });

  describe("format", () => {
    it("should format standard threshold mode result", () => {
      const result: GatingResult = {
        meetsThreshold: true,
        threshold: 80,
        mode: "standard",
        prCoveragePercentage: 85,
        overallProjectCoveragePercentage: 75,
        description: "✅ PR coverage (85%) meets or exceeds threshold (80%)",
      };

      const formatted = CoverageGating.format(result);

      expect(formatted).toContain("🎯 Coverage Gating Results");
      expect(formatted).toContain("📊 Mode: Standard Threshold");
      expect(formatted).toContain("📈 PR Coverage: 85%");
      expect(formatted).toContain("🎯 Threshold: 80%");
      expect(formatted).toContain(
        "✅ PR coverage (85%) meets or exceeds threshold (80%)",
      );
    });

    it("should format baseline mode result", () => {
      const result: GatingResult = {
        meetsThreshold: false,
        threshold: 0,
        mode: "baseline",
        prCoveragePercentage: 75,
        overallProjectCoveragePercentage: 80,
        description:
          "❌ PR coverage (75%) is below overall project coverage (80%)",
        errorMessage:
          "Coverage gating failed: PR changes coverage (75%) is lower than overall project coverage (80%)",
      };

      const formatted = CoverageGating.format(result);

      expect(formatted).toContain("🎯 Coverage Gating Results");
      expect(formatted).toContain("📊 Mode: Project Baseline");
      expect(formatted).toContain("📈 PR Coverage: 75%");
      expect(formatted).toContain("📊 Project Coverage: 80%");
      expect(formatted).toContain(
        "🎯 Requirement: PR coverage ≥ Project coverage",
      );
      expect(formatted).toContain(
        "❌ PR coverage (75%) is below overall project coverage (80%)",
      );
    });

    it("should format disabled mode result", () => {
      const result: GatingResult = {
        meetsThreshold: true,
        threshold: 80,
        mode: "disabled",
        prCoveragePercentage: 42,
        overallProjectCoveragePercentage: 80,
        description:
          "ℹ️ Coverage gating disabled — PR coverage (42%) is not enforced",
      };

      const formatted = CoverageGating.format(result);

      expect(formatted).toContain("📊 Mode: Disabled");
      expect(formatted).toContain("📈 PR Coverage: 42%");
      expect(formatted).toContain("🎯 Requirement: none (gating disabled)");
      expect(formatted).toContain(
        "ℹ️ Coverage gating disabled — PR coverage (42%) is not enforced",
      );
    });
  });
});
