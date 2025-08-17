import {
  PrCommentService,
  CommentData,
  generateCommentBody,
  formatFileSize,
} from "./prComment";
import { CoverageAnalysis } from "./coverageAnalyzer";
import { LcovReport } from "./lcov";
import { GatingResult } from "./coverageGating";

describe("PrCommentService", () => {
  let originalGitHubRepository: string | undefined;
  let originalGitHubRunId: string | undefined;

  beforeEach(() => {
    originalGitHubRepository = process.env.GITHUB_REPOSITORY;
    originalGitHubRunId = process.env.GITHUB_RUN_ID;
  });

  afterEach(() => {
    if (originalGitHubRepository) {
      process.env.GITHUB_REPOSITORY = originalGitHubRepository;
    } else {
      delete process.env.GITHUB_REPOSITORY;
    }

    if (originalGitHubRunId) {
      process.env.GITHUB_RUN_ID = originalGitHubRunId;
    } else {
      delete process.env.GITHUB_RUN_ID;
    }
  });

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

    test("should include artifact information in comment when provided", () => {
      // Set up GitHub environment
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.GITHUB_RUN_ID = "123";

      const commentData: CommentData = {
        totalCoverage: {
          linesHit: 800,
          linesFound: 1000,
          percentage: 80,
        },
        changedFilesCoverage: {
          linesHit: 40,
          linesFound: 50,
          percentage: 80,
        },
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

      const artifactInfo = {
        name: "coverage-treemap-pr-123",
        path: "./coverage-treemap.png",
        downloadUrl:
          "https://github.com/owner/repo/actions/runs/123/artifacts/coverage-treemap",
        size: 2048,
      };

      const result = generateCommentBody(
        mockCoverageAnalysis,
        {
          meetsThreshold: true,
          threshold: 80,
          mode: "standard" as const,
          prCoveragePercentage: 85,
          description: "Coverage meets threshold",
        },
        artifactInfo,
      );

      expect(result).toContain("### 📊 Coverage Treemap Visualization");
      expect(result).toContain("coverage-treemap-pr-123");
      expect(result).toContain("2.0 KB");
      expect(result).toContain(
        "https://github.com/owner/repo/actions/runs/123",
      );
      expect(result).toContain(
        "A visual treemap has been generated showing coverage by function/method",
      );
    });
  });

  describe("formatFileSize", () => {
    test("should format file sizes correctly", () => {
      expect(formatFileSize(0)).toBe("0.0 B");
      expect(formatFileSize(512)).toBe("512.0 B");
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
      expect(formatFileSize(1048576)).toBe("1.0 MB");
      expect(formatFileSize(1073741824)).toBe("1.0 GB");
    });
  });
});
