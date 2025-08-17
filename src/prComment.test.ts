import {
  PrCommentService,
  CommentData,
  generateCommentBody,
  formatFileSize,
} from "./prComment";
import { CoverageAnalysis } from "./coverageAnalyzer";
import { LcovReport } from "./lcov";
import { GatingResult } from "./coverageGating";

// Mock @actions/github
jest.mock("@actions/github", () => ({
  context: {
    repo: { owner: "testowner", repo: "testrepo" },
    payload: {
      pull_request: { number: 123 },
    },
  },
  getOctokit: jest.fn(),
}));

import { getOctokit, context } from "@actions/github";

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
      expect(result).toContain("direct download");
      expect(result).toContain("📥 **[Download treemap visualization]");
    });
  });

  describe("formatFileSize", () => {
    test("should format file sizes correctly", () => {
      expect(formatFileSize(500)).toBe("500.0 B");
      expect(formatFileSize(1536)).toBe("1.5 KB");
      expect(formatFileSize(1048576)).toBe("1.0 MB");
      expect(formatFileSize(1073741824)).toBe("1.0 GB");
    });
  });

  describe("findExistingComment", () => {
    let mockOctokit: any;
    let prCommentService: PrCommentService;

    beforeEach(() => {
      mockOctokit = {
        rest: {
          issues: {
            listComments: jest.fn(),
          },
        },
      };

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);

      prCommentService = new PrCommentService({
        githubToken: "test-token",
        label: "Test Label",
      });
    });

    test("should find existing comment when it exists", async () => {
      const mockComments = {
        data: [
          { id: 1, body: "Some other comment" },
          { id: 2, body: "## Coveragemap Action: Test Label\nSome content" },
          { id: 3, body: "Another comment" },
        ],
      };

      mockOctokit.rest.issues.listComments.mockResolvedValue(mockComments);

      const result = await (prCommentService as any).findExistingComment();

      expect(result).toBe(2);
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledWith({
        owner: "testowner",
        repo: "testrepo",
        issue_number: 123,
      });
    });

    test("should return null when no existing comment found", async () => {
      const mockComments = {
        data: [
          { id: 1, body: "Some other comment" },
          { id: 3, body: "Another comment" },
        ],
      };

      mockOctokit.rest.issues.listComments.mockResolvedValue(mockComments);

      const result = await (prCommentService as any).findExistingComment();

      expect(result).toBeNull();
    });

    test("should throw error when not in pull request context", async () => {
      // Temporarily modify the context
      const originalPullRequest = context.payload.pull_request;
      (context.payload as any).pull_request = null;

      await expect(
        (prCommentService as any).findExistingComment(),
      ).rejects.toThrow("This action can only be run on pull requests");

      // Restore the context
      (context.payload as any).pull_request = originalPullRequest;
    });
  });

  describe("postComment", () => {
    let mockOctokit: any;
    let prCommentService: PrCommentService;
    let mockAnalysis: CoverageAnalysis;
    let mockLcovReport: LcovReport;
    let mockGatingResult: GatingResult;

    beforeEach(() => {
      mockOctokit = {
        rest: {
          issues: {
            listComments: jest.fn(),
            createComment: jest.fn(),
            updateComment: jest.fn(),
          },
        },
      };

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);

      prCommentService = new PrCommentService({
        githubToken: "test-token",
        label: "Test Label",
      });

      mockAnalysis = {
        changeset: { files: [], baseSha: "abc123", headSha: "def456" },
        changedFiles: [],
        summary: {
          totalChangedFiles: 0,
          filesWithCoverage: 0,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 100,
            coveredLines: 85,
            totalFunctions: 10,
            coveredFunctions: 8,
            totalBranches: 20,
            coveredBranches: 15,
            linesCoveragePercentage: 85,
            functionsCoveragePercentage: 80,
            branchesCoveragePercentage: 75,
            overallCoveragePercentage: 85,
          },
        },
        uncoveredFunctions: [],
        uncoveredLines: [],
        toString: jest.fn().mockReturnValue("Mock analysis"),
      } as any;

      mockLcovReport = {
        files: new Map(),
        summary: {
          totalFiles: 0,
          functionsFound: 10,
          functionsHit: 8,
          linesFound: 100,
          linesHit: 85,
          branchesFound: 20,
          branchesHit: 15,
        },
      } as any;

      mockGatingResult = {
        meetsThreshold: true,
        threshold: 80,
        mode: "standard" as const,
        prCoveragePercentage: 85,
        description: "Coverage meets threshold",
      };
    });

    test("should create new comment when no existing comment found", async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] });
      mockOctokit.rest.issues.createComment.mockResolvedValue({
        data: { id: 456 },
      });

      await prCommentService.postComment(
        mockAnalysis,
        mockLcovReport,
        mockGatingResult,
      );

      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: "testowner",
        repo: "testrepo",
        issue_number: 123,
        body: expect.stringContaining("Coveragemap Action: Test Label"),
      });
    });

    test("should update existing comment when found", async () => {
      const mockComments = {
        data: [
          { id: 789, body: "## Coveragemap Action: Test Label\nOld content" },
        ],
      };

      mockOctokit.rest.issues.listComments.mockResolvedValue(mockComments);

      await prCommentService.postComment(
        mockAnalysis,
        mockLcovReport,
        mockGatingResult,
      );

      expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: "testowner",
        repo: "testrepo",
        comment_id: 789,
        body: expect.stringContaining("Coveragemap Action: Test Label"),
      });
    });

    test("should throw error when not in pull request context", async () => {
      // Temporarily modify the context
      const originalPullRequest = context.payload.pull_request;
      (context.payload as any).pull_request = null;

      await expect(
        prCommentService.postComment(
          mockAnalysis,
          mockLcovReport,
          mockGatingResult,
        ),
      ).rejects.toThrow("This action can only be run on pull requests");

      // Restore the context
      (context.payload as any).pull_request = originalPullRequest;
    });

    test("should handle API errors gracefully", async () => {
      mockOctokit.rest.issues.listComments.mockRejectedValue(
        new Error("API Error"),
      );

      await expect(
        prCommentService.postComment(
          mockAnalysis,
          mockLcovReport,
          mockGatingResult,
        ),
      ).rejects.toThrow("Failed to post PR comment: API Error");
    });
  });
});
