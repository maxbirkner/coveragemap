import { PrCommentService, CommentData } from "./prComment";
import { CoverageAnalysis } from "./coverageAnalyzer";
import { LcovReport } from "./lcov";
import { GatingResult } from "./coverageGating";

describe("PrCommentService", () => {
  const mockLcovReport: LcovReport = {
    files: new Map(),
    summary: {
      totalFiles: 5,
      linesFound: 1000,
      linesHit: 800,
      functionsFound: 100,
      functionsHit: 85,
      branchesFound: 50,
      branchesHit: 40,
    },
  };

  const mockCoverageAnalysis: CoverageAnalysis = {
    changeset: {
      baseCommit: "abc123",
      headCommit: "def456",
      targetBranch: "main",
      files: [
        {
          path: "src/example.ts",
          status: "modified",
        },
      ],
      totalFiles: 1,
    },
    changedFiles: [
      {
        path: "src/example.ts",
        status: "modified",
        coverage: {
          path: "src/example.ts",
          summary: {
            linesFound: 50,
            linesHit: 40,
            functionsFound: 5,
            functionsHit: 4,
            branchesFound: 10,
            branchesHit: 8,
          },
          lines: [],
          functions: [],
          branches: [],
        },
        analysis: {
          totalLines: 50,
          coveredLines: 40,
          totalFunctions: 5,
          coveredFunctions: 4,
          totalBranches: 10,
          coveredBranches: 8,
          linesCoveragePercentage: 80,
          functionsCoveragePercentage: 80,
          branchesCoveragePercentage: 80,
          overallCoveragePercentage: 80,
        },
      },
    ],
    summary: {
      totalChangedFiles: 1,
      filesWithCoverage: 1,
      filesWithoutCoverage: 0,
      overallCoverage: {
        totalLines: 50,
        coveredLines: 40,
        totalFunctions: 5,
        coveredFunctions: 4,
        totalBranches: 10,
        coveredBranches: 8,
        linesCoveragePercentage: 80,
        functionsCoveragePercentage: 80,
        branchesCoveragePercentage: 80,
        overallCoveragePercentage: 80,
      },
    },
  };

  describe("createCommentData", () => {
    test("should create comment data correctly", () => {
      const result = PrCommentService.createCommentData(
        mockCoverageAnalysis,
        mockLcovReport,
      );

      expect(result.totalCoverage).toEqual({
        linesHit: 800,
        linesFound: 1000,
        percentage: 80,
      });

      expect(result.changedFilesCoverage).toEqual({
        linesHit: 40,
        linesFound: 50,
        percentage: 80,
      });

      expect(result.coverageDifference).toBe(0);

      expect(result.fileBreakdown).toEqual([
        {
          filename: "src/example.ts",
          linesHit: 40,
          linesFound: 50,
          percentage: 80,
        },
      ]);
    });

    test("should handle files without coverage", () => {
      const analysisWithoutCoverage: CoverageAnalysis = {
        ...mockCoverageAnalysis,
        changedFiles: [
          {
            path: "src/no-coverage.ts",
            status: "added",
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

      const result = PrCommentService.createCommentData(
        analysisWithoutCoverage,
        mockLcovReport,
      );

      expect(result.fileBreakdown).toEqual([]); // No files with coverage
      expect(result.changedFilesCoverage.percentage).toBe(0);
    });
  });

  describe("comment title generation", () => {
    test("should generate title without label", () => {
      const service = new PrCommentService({
        githubToken: "test-token",
      });

      // Access private method for testing
      const getCommentTitle = (
        service as unknown as { getCommentTitle: () => string }
      ).getCommentTitle.bind(service);
      expect(getCommentTitle()).toBe("Coveragemap Action");
    });

    test("should generate title with label", () => {
      const service = new PrCommentService({
        githubToken: "test-token",
        label: "Frontend",
      });

      // Access private method for testing
      const getCommentTitle = (
        service as unknown as { getCommentTitle: () => string }
      ).getCommentTitle.bind(service);
      expect(getCommentTitle()).toBe("Coveragemap Action: Frontend");
    });
  });

  describe("comment body generation", () => {
    test("should generate proper markdown comment", () => {
      const service = new PrCommentService({
        githubToken: "test-token",
        label: "Test",
      });

      const commentData: CommentData = {
        totalCoverage: { linesHit: 800, linesFound: 1000, percentage: 80 },
        changedFilesCoverage: { linesHit: 40, linesFound: 50, percentage: 80 },
        coverageDifference: 0,
        fileBreakdown: [
          {
            filename: "src/example.ts",
            linesHit: 40,
            linesFound: 50,
            percentage: 80,
          },
        ],
      };

      const gatingResult: GatingResult = {
        meetsThreshold: true,
        threshold: 75,
        mode: "standard",
        prCoveragePercentage: 80,
        overallProjectCoveragePercentage: 75,
        description: "✅ PR coverage (80%) meets or exceeds threshold (75%)",
      };

      // Access private method for testing
      const generateCommentBody = (
        service as unknown as {
          generateCommentBody: (
            data: CommentData,
            gatingResult: GatingResult,
          ) => string;
        }
      ).generateCommentBody.bind(service);
      const result = generateCommentBody(commentData, gatingResult);

      expect(result).toContain("## Coveragemap Action: Test");
      expect(result).toContain("| **Total Coverage** | 80% | 800/1000 |");
      expect(result).toContain("| **Changed Files** | 80% | 40/50 |");
      expect(result).toContain("| **Difference** | 📈 +0% | - |");
      expect(result).toContain("| **Threshold** | ✅ 75% | - |");
      expect(result).toContain("✅ `src/example.ts` | 80% | 40/50");
    });

    test("should show failing threshold", () => {
      const service = new PrCommentService({
        githubToken: "test-token",
      });

      const commentData: CommentData = {
        totalCoverage: { linesHit: 800, linesFound: 1000, percentage: 80 },
        changedFilesCoverage: { linesHit: 40, linesFound: 50, percentage: 60 },
        coverageDifference: -20,
        fileBreakdown: [],
      };

      const gatingResult: GatingResult = {
        meetsThreshold: false,
        threshold: 75,
        mode: "standard",
        prCoveragePercentage: 60,
        overallProjectCoveragePercentage: 80,
        description: "❌ PR coverage (60%) is below threshold (75%)",
        errorMessage:
          "Coverage gating failed: PR changes coverage (60%) is below threshold (75%)",
      };

      // Access private method for testing
      const generateCommentBody = (
        service as unknown as {
          generateCommentBody: (
            data: CommentData,
            gatingResult: GatingResult,
          ) => string;
        }
      ).generateCommentBody.bind(service);
      const result = generateCommentBody(commentData, gatingResult);

      expect(result).toContain("| **Threshold** | ❌ 75% | - |");
      expect(result).toContain("| **Difference** | 📉 -20% | - |");
    });

    test("should handle threshold = 0 (compare against project average)", () => {
      const service = new PrCommentService({
        githubToken: "test-token",
      });

      const commentData: CommentData = {
        totalCoverage: { linesHit: 800, linesFound: 1000, percentage: 80 },
        changedFilesCoverage: { linesHit: 40, linesFound: 50, percentage: 85 },
        coverageDifference: 5,
        fileBreakdown: [
          {
            filename: "src/example.ts",
            linesHit: 40,
            linesFound: 50,
            percentage: 85,
          },
        ],
      };

      const gatingResult: GatingResult = {
        meetsThreshold: true,
        threshold: 0,
        mode: "baseline",
        prCoveragePercentage: 85,
        overallProjectCoveragePercentage: 80,
        description:
          "✅ PR coverage (85%) meets or exceeds overall project coverage (80%)",
      };

      // Access private method for testing
      const generateCommentBody = (
        service as unknown as {
          generateCommentBody: (
            data: CommentData,
            gatingResult: GatingResult,
          ) => string;
        }
      ).generateCommentBody.bind(service);
      const result = generateCommentBody(commentData, gatingResult);

      expect(result).toContain(
        "| **Threshold** | ✅ ≥ Project Avg (80%) | - |",
      );
      expect(result).toContain("✅ `src/example.ts` | 85% | 40/50");
    });

    test("should show failing threshold = 0 when PR coverage is below project average", () => {
      const service = new PrCommentService({
        githubToken: "test-token",
      });

      const commentData: CommentData = {
        totalCoverage: { linesHit: 800, linesFound: 1000, percentage: 80 },
        changedFilesCoverage: { linesHit: 30, linesFound: 50, percentage: 60 },
        coverageDifference: -20,
        fileBreakdown: [
          {
            filename: "src/example.ts",
            linesHit: 30,
            linesFound: 50,
            percentage: 60,
          },
        ],
      };

      const gatingResult: GatingResult = {
        meetsThreshold: false,
        threshold: 0,
        mode: "baseline",
        prCoveragePercentage: 60,
        overallProjectCoveragePercentage: 80,
        description:
          "❌ PR coverage (60%) is below overall project coverage (80%)",
        errorMessage:
          "Coverage gating failed: PR changes coverage (60%) is lower than overall project coverage (80%)",
      };

      // Access private method for testing
      const generateCommentBody = (
        service as unknown as {
          generateCommentBody: (
            data: CommentData,
            gatingResult: GatingResult,
          ) => string;
        }
      ).generateCommentBody.bind(service);
      const result = generateCommentBody(commentData, gatingResult);

      expect(result).toContain(
        "| **Threshold** | ❌ ≥ Project Avg (80%) | - |",
      );
      expect(result).toContain("❌ `src/example.ts` | 60% | 30/50");
    });
  });
});
