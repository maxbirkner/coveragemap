import {
  ChecksService,
  ChecksServiceConfig,
  CheckAnnotation,
} from "./checksService";
import { CoverageAnalysis, FileChangeWithCoverage } from "./coverageAnalyzer";
import { ChangesetUtils } from "./changeset";
import { GatingResult } from "./coverageGating";

// Mock @actions/core
jest.mock("@actions/core", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  setFailed: jest.fn(),
  warning: jest.fn(),
}));

// Mock @actions/github
jest.mock("@actions/github", () => ({
  context: {
    repo: { owner: "testowner", repo: "testrepo" },
    payload: {
      pull_request: {
        head: { sha: "test-head-sha" },
        number: 123,
      },
    },
    serverUrl: "https://github.com",
  },
  getOctokit: jest.fn(),
}));

// Mock @octokit/auth-app
jest.mock("@octokit/auth-app", () => ({
  createAppAuth: jest.fn(),
}));

import * as core from "@actions/core";
import * as github from "@actions/github";
import { createAppAuth } from "@octokit/auth-app";

const mockedCore = core as jest.Mocked<typeof core>;
const mockedGithub = github as jest.Mocked<typeof github>;
const mockedCreateAppAuth = createAppAuth as jest.MockedFunction<
  typeof createAppAuth
>;

describe("ChecksService", () => {
  let checksService: ChecksService;
  const mockConfig: ChecksServiceConfig = {
    githubAppId: "123456",
    githubAppPrivateKey:
      "-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----",
    githubToken: "ghp_token",
    coverageThreshold: 80,
  };

  const createMockGatingResult = (
    meetsThreshold: boolean = true,
    threshold: number = 80,
  ): GatingResult => ({
    meetsThreshold,
    threshold,
    mode: "standard",
    prCoveragePercentage: 85,
    description: "Test description",
    errorMessage: undefined,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    checksService = new ChecksService(mockConfig);
  });

  describe("isEnabled", () => {
    it("should return true when GitHub App credentials are provided", () => {
      const result = ChecksService.isEnabled("123456", "private-key");
      expect(result).toBe(true);
    });

    it("should return false when GitHub App credentials are missing", () => {
      const result = ChecksService.isEnabled(undefined, undefined);
      expect(result).toBe(false);
    });

    it("should return false when only one credential is provided", () => {
      expect(ChecksService.isEnabled("123456", undefined)).toBe(false);
      expect(ChecksService.isEnabled(undefined, "private-key")).toBe(false);
    });
  });

  describe("getCheckName", () => {
    it("should return default name when no label is provided", () => {
      const config = { ...mockConfig };
      const service = new ChecksService(config);
      const checkName = (service as any).getCheckName();
      expect(checkName).toBe("Coverage Treemap Action");
    });

    it("should return name with label when label is provided", () => {
      const config = { ...mockConfig, label: "Frontend" };
      const service = new ChecksService(config);
      const checkName = (service as any).getCheckName();
      expect(checkName).toBe("Coverage Treemap Action: Frontend");
    });
  });

  describe("generateAnnotations", () => {
    it("should generate annotations for uncovered lines", () => {
      const fileWithCoverage: FileChangeWithCoverage = {
        path: "src/test.ts",
        status: "modified",
        coverage: {
          path: "src/test.ts",
          functions: [
            {
              name: "testFunction",
              hit: 0,
              line: 5,
            },
          ],
          branches: [],
          lines: [
            { line: 3, hit: 0 },
            { line: 7, hit: 0 },
          ],
          summary: {
            functionsFound: 1,
            functionsHit: 0,
            linesFound: 20,
            linesHit: 10,
            branchesFound: 0,
            branchesHit: 0,
          },
        },
        analysis: {
          totalLines: 20,
          coveredLines: 10,
          totalFunctions: 1,
          coveredFunctions: 0,
          totalBranches: 0,
          coveredBranches: 0,
          linesCoveragePercentage: 50,
          functionsCoveragePercentage: 0,
          branchesCoveragePercentage: 0,
          overallCoveragePercentage: 50,
        },
      };

      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [fileWithCoverage],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 20,
            coveredLines: 10,
            totalFunctions: 1,
            coveredFunctions: 0,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 50,
            functionsCoveragePercentage: 0,
            branchesCoveragePercentage: 0,
            overallCoveragePercentage: 50,
          },
        },
      };

      const annotations = checksService.generateAnnotations(analysis);

      expect(annotations).toHaveLength(4); // 2 uncovered lines + 1 uncovered function + 1 low coverage summary
      expect(annotations[0]).toEqual({
        path: "src/test.ts",
        start_line: 3,
        end_line: 3,
        annotation_level: "warning",
        title: "Uncovered Lines",
        message: "Line 3 is not covered by tests",
      });
      expect(annotations[1]).toEqual({
        path: "src/test.ts",
        start_line: 7,
        end_line: 7,
        annotation_level: "warning",
        title: "Uncovered Lines",
        message: "Line 7 is not covered by tests",
      });
      expect(annotations[2]).toEqual({
        path: "src/test.ts",
        start_line: 5,
        end_line: 5,
        annotation_level: "warning",
        title: "Uncovered Function",
        message: "Function 'testFunction' is not covered by tests",
      });
      expect(annotations[3]).toEqual({
        path: "src/test.ts",
        start_line: 1,
        end_line: 1,
        annotation_level: "notice",
        title: "Low Coverage",
        message:
          "File coverage is 50%. Consider adding more tests to improve coverage.",
        raw_details: expect.stringContaining(
          "Coverage Summary for src/test.ts:",
        ),
      });
    });

    it("should generate annotation for file without coverage", () => {
      const fileWithoutCoverage: FileChangeWithCoverage = {
        path: "src/test.ts",
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
      };

      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [fileWithoutCoverage],
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

      const annotations = checksService.generateAnnotations(analysis);

      expect(annotations).toHaveLength(1);
      expect(annotations[0]).toEqual({
        path: "src/test.ts",
        start_line: 1,
        end_line: 1,
        annotation_level: "warning",
        title: "No Coverage Data",
        message:
          "This file has no coverage data. Consider adding tests or ensuring the file is included in coverage instrumentation.",
      });
    });

    it("should return empty array when no coverage issues", () => {
      const fileWithFullCoverage: FileChangeWithCoverage = {
        path: "src/test.ts",
        status: "modified",
        coverage: {
          path: "src/test.ts",
          functions: [
            {
              name: "testFunction",
              hit: 1,
              line: 5,
            },
          ],
          branches: [],
          lines: [
            { line: 3, hit: 1 },
            { line: 7, hit: 1 },
          ],
          summary: {
            functionsFound: 1,
            functionsHit: 1,
            linesFound: 10,
            linesHit: 10,
            branchesFound: 0,
            branchesHit: 0,
          },
        },
        analysis: {
          totalLines: 10,
          coveredLines: 10,
          totalFunctions: 1,
          coveredFunctions: 1,
          totalBranches: 0,
          coveredBranches: 0,
          linesCoveragePercentage: 100,
          functionsCoveragePercentage: 100,
          branchesCoveragePercentage: 0,
          overallCoveragePercentage: 100,
        },
      };

      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [fileWithFullCoverage],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 10,
            coveredLines: 10,
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

      const annotations = checksService.generateAnnotations(analysis);

      expect(annotations).toHaveLength(0);
    });

    it("should group consecutive uncovered lines", () => {
      const fileWithConsecutiveLines: FileChangeWithCoverage = {
        path: "src/test.ts",
        status: "modified",
        coverage: {
          path: "src/test.ts",
          functions: [],
          branches: [],
          lines: [
            { line: 1, hit: 1 },
            { line: 2, hit: 0 },
            { line: 3, hit: 0 },
            { line: 4, hit: 0 },
            { line: 5, hit: 1 },
            { line: 6, hit: 0 },
            { line: 8, hit: 0 },
            { line: 9, hit: 0 },
          ],
          summary: {
            functionsFound: 0,
            functionsHit: 0,
            linesFound: 8,
            linesHit: 3,
            branchesFound: 0,
            branchesHit: 0,
          },
        },
        analysis: {
          totalLines: 8,
          coveredLines: 3,
          totalFunctions: 0,
          coveredFunctions: 0,
          totalBranches: 0,
          coveredBranches: 0,
          linesCoveragePercentage: 37.5,
          functionsCoveragePercentage: 0,
          branchesCoveragePercentage: 0,
          overallCoveragePercentage: 37.5,
        },
      };

      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [fileWithConsecutiveLines],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 8,
            coveredLines: 3,
            totalFunctions: 0,
            coveredFunctions: 0,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 37.5,
            functionsCoveragePercentage: 0,
            branchesCoveragePercentage: 0,
            overallCoveragePercentage: 37.5,
          },
        },
      };

      const annotations = checksService.generateAnnotations(analysis);

      expect(annotations).toHaveLength(4); // 3 line groups + 1 low coverage notice
      expect(annotations[0]).toEqual({
        path: "src/test.ts",
        start_line: 2,
        end_line: 4,
        annotation_level: "warning",
        title: "Uncovered Lines",
        message: "Lines 2-4 are not covered by tests",
      });
      expect(annotations[1]).toEqual({
        path: "src/test.ts",
        start_line: 6,
        end_line: 6,
        annotation_level: "warning",
        title: "Uncovered Lines",
        message: "Line 6 is not covered by tests",
      });
      expect(annotations[2]).toEqual({
        path: "src/test.ts",
        start_line: 8,
        end_line: 9,
        annotation_level: "warning",
        title: "Uncovered Lines",
        message: "Lines 8-9 are not covered by tests",
      });
    });

    it("should handle files with no coverage lines", () => {
      const fileWithNoLines: FileChangeWithCoverage = {
        path: "src/test.ts",
        status: "modified",
        coverage: {
          path: "src/test.ts",
          functions: [],
          branches: [],
          lines: [],
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
      };

      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [fileWithNoLines],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
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
      };

      const annotations = checksService.generateAnnotations(analysis);
      expect(annotations).toHaveLength(0);
    });

    it("should handle annotations priority and sorting", () => {
      const fileWithMixedIssues: FileChangeWithCoverage = {
        path: "src/test.ts",
        status: "modified",
        coverage: {
          path: "src/test.ts",
          functions: [{ name: "func1", hit: 0, line: 10 }],
          branches: [],
          lines: [{ line: 5, hit: 0 }],
          summary: {
            functionsFound: 1,
            functionsHit: 0,
            linesFound: 2,
            linesHit: 1,
            branchesFound: 0,
            branchesHit: 0,
          },
        },
        analysis: {
          totalLines: 2,
          coveredLines: 1,
          totalFunctions: 1,
          coveredFunctions: 0,
          totalBranches: 0,
          coveredBranches: 0,
          linesCoveragePercentage: 50,
          functionsCoveragePercentage: 0,
          branchesCoveragePercentage: 0,
          overallCoveragePercentage: 50,
        },
      };

      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [fileWithMixedIssues],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 2,
            coveredLines: 1,
            totalFunctions: 1,
            coveredFunctions: 0,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 50,
            functionsCoveragePercentage: 0,
            branchesCoveragePercentage: 0,
            overallCoveragePercentage: 50,
          },
        },
      };

      const annotations = checksService.generateAnnotations(analysis);

      // Should have: 1 uncovered line + 1 uncovered function + 1 low coverage = 3 annotations
      expect(annotations).toHaveLength(3);

      // Verify all are warnings (priority should sort them correctly)
      expect(
        annotations.every(
          (a) =>
            a.annotation_level === "warning" || a.annotation_level === "notice",
        ),
      ).toBe(true);
    });
  });

  describe("generateCheckTitle", () => {
    it("should generate correct title with coverage percentage", () => {
      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test1.ts", "src/test2.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [],
        summary: {
          totalChangedFiles: 2,
          filesWithCoverage: 1,
          filesWithoutCoverage: 1,
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
      };

      const title = (checksService as any).generateCheckTitle(analysis);
      expect(title).toBe("Coverage: 85% (1/2 files)");
    });
  });

  describe("generateCheckSummary", () => {
    it("should generate summary for files with coverage", () => {
      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [
          {
            path: "src/test.ts",
            status: "modified",
            coverage: {
              path: "src/test.ts",
              functions: [],
              branches: [],
              lines: [],
              summary: {
                functionsFound: 10,
                functionsHit: 8,
                linesFound: 100,
                linesHit: 85,
                branchesFound: 20,
                branchesHit: 15,
              },
            },
            analysis: {
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
        ],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
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
      };

      const summary = (checksService as any).generateCheckSummary(analysis);

      expect(summary).toContain("## Coverage Analysis Summary");
      expect(summary).toContain("**Overall Coverage:** 85% (Threshold: 80%)");
      expect(summary).toContain("**Total files:** 1");
      expect(summary).toContain("**Files with coverage:** 1");
      expect(summary).toContain("**Files without coverage:** 0");
      expect(summary).toContain("**Lines:** 85/100 (85%)");
      expect(summary).toContain("**Functions:** 8/10 (80%)");
      expect(summary).toContain("**Branches:** 15/20 (75%)");
    });

    it("should include files without coverage section", () => {
      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test1.ts", "src/test2.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [
          {
            path: "src/test1.ts",
            status: "modified",
            coverage: {
              path: "src/test1.ts",
              functions: [],
              branches: [],
              lines: [],
              summary: {
                functionsFound: 10,
                functionsHit: 8,
                linesFound: 100,
                linesHit: 85,
                branchesFound: 20,
                branchesHit: 15,
              },
            },
            analysis: {
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
          {
            path: "src/test2.ts",
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
          totalChangedFiles: 2,
          filesWithCoverage: 1,
          filesWithoutCoverage: 1,
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
      };

      const summary = (checksService as any).generateCheckSummary(analysis);

      expect(summary).toContain("### ⚠️ Files Without Coverage");
      expect(summary).toContain(
        "[src/test2.ts](https://github.com/testowner/testrepo/blob/test-head-sha/src/test2.ts)",
      );
    });
  });

  describe("determineCheckConclusion", () => {
    it("should return success when coverage meets threshold", () => {
      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
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
      };

      const gatingResult = createMockGatingResult(true, 80); // meetsThreshold = true
      const conclusion = (checksService as any).determineCheckConclusion(
        gatingResult,
      );
      expect(conclusion).toBe("success");
    });

    it("should return failure when coverage is below threshold", () => {
      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 100,
            coveredLines: 70,
            totalFunctions: 10,
            coveredFunctions: 7,
            totalBranches: 20,
            coveredBranches: 14,
            linesCoveragePercentage: 70,
            functionsCoveragePercentage: 70,
            branchesCoveragePercentage: 70,
            overallCoveragePercentage: 70,
          },
        },
      };

      const gatingResult = createMockGatingResult(false, 80); // meetsThreshold = false
      const conclusion = (checksService as any).determineCheckConclusion(
        gatingResult,
      );
      expect(conclusion).toBe("failure");
    });

    it("should return success when coverage exactly meets threshold", () => {
      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 100,
            coveredLines: 80,
            totalFunctions: 10,
            coveredFunctions: 8,
            totalBranches: 20,
            coveredBranches: 16,
            linesCoveragePercentage: 80,
            functionsCoveragePercentage: 80,
            branchesCoveragePercentage: 80,
            overallCoveragePercentage: 80,
          },
        },
      };

      const gatingResult = createMockGatingResult(true, 80); // meetsThreshold = true
      const conclusion = (checksService as any).determineCheckConclusion(
        gatingResult,
      );
      expect(conclusion).toBe("success");
    });
  });

  describe("createAnnotationsArtifact", () => {
    it("should return correct file path", async () => {
      const annotations = [
        {
          path: "src/test.ts",
          start_line: 1,
          end_line: 1,
          annotation_level: "warning" as const,
          title: "Test",
          message: "Test message",
        },
      ];

      const result = await checksService.createAnnotationsArtifact(annotations);

      expect(result).toMatch(/.*annotations\.json$/);
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📝 Created annotations.json with 1 annotations",
      );
    });
  });

  describe("postAnnotations", () => {
    let mockOctokit: any;
    let mockAppAuth: any;

    beforeEach(() => {
      mockOctokit = {
        rest: {
          apps: {
            getRepoInstallation: jest.fn(),
          },
          checks: {
            create: jest.fn(),
          },
        },
      };

      mockAppAuth = jest.fn();
      mockedCreateAppAuth.mockReturnValue(mockAppAuth);
      mockedGithub.getOctokit.mockReturnValue(mockOctokit);
    });

    it("should post annotations successfully", async () => {
      const originalGitHubRunId = process.env.GITHUB_RUN_ID;
      delete process.env.GITHUB_RUN_ID;

      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
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
      };

      const annotations = [
        {
          path: "src/test.ts",
          start_line: 1,
          end_line: 1,
          annotation_level: "warning" as const,
          title: "Test",
          message: "Test message",
        },
      ];

      // Mock GitHub App authentication flow
      mockAppAuth
        .mockResolvedValueOnce({ token: "app-token" })
        .mockResolvedValueOnce({ token: "installation-token" });

      mockOctokit.rest.apps.getRepoInstallation.mockResolvedValue({
        data: { id: 12345 },
      });

      mockOctokit.rest.checks.create.mockResolvedValue({
        data: { html_url: "https://github.com/owner/repo/runs/123" },
      });

      await checksService.postAnnotations(
        analysis,
        createMockGatingResult(),
        annotations,
      );

      expect(mockedCreateAppAuth).toHaveBeenCalledWith({
        appId: "123456",
        privateKey:
          "-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----",
      });
      expect(mockAppAuth).toHaveBeenCalledWith({ type: "app" });
      expect(mockAppAuth).toHaveBeenCalledWith({
        type: "installation",
        installationId: 12345,
      });
      expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith({
        owner: "testowner",
        repo: "testrepo",
        name: "Coverage Treemap Action",
        head_sha: "test-head-sha",
        status: "completed",
        conclusion: "success",
        details_url: "https://github.com/testowner/testrepo/pull/123",
        output: {
          title: "Coverage: 85% (1/1 files)",
          summary: expect.stringContaining("## Coverage Analysis Summary"),
          annotations: annotations,
        },
      });
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📊 Check conclusion: success",
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📈 Coverage: 85% (Threshold: 80%)",
      );

      // Restore original environment
      if (originalGitHubRunId !== undefined) {
        process.env.GITHUB_RUN_ID = originalGitHubRunId;
      }
    });

    it("should use label in check name when provided", async () => {
      const originalGitHubRunId = process.env.GITHUB_RUN_ID;
      delete process.env.GITHUB_RUN_ID;

      // Create a service with a label
      const configWithLabel = { ...mockConfig, label: "Frontend" };
      const labeledChecksService = new ChecksService(configWithLabel);

      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
          filesWithoutCoverage: 0,
          overallCoverage: {
            totalLines: 10,
            coveredLines: 8,
            totalFunctions: 2,
            coveredFunctions: 2,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 80,
            functionsCoveragePercentage: 100,
            branchesCoveragePercentage: 100,
            overallCoveragePercentage: 85,
          },
        },
      };

      const annotations: CheckAnnotation[] = [
        {
          path: "src/test.ts",
          start_line: 5,
          end_line: 6,
          annotation_level: "warning",
          title: "Test",
          message: "Test message",
        },
      ];

      // Mock GitHub App authentication flow
      mockAppAuth
        .mockResolvedValueOnce({ token: "app-token" })
        .mockResolvedValueOnce({ token: "installation-token" });

      mockOctokit.rest.apps.getRepoInstallation.mockResolvedValue({
        data: { id: 12345 },
      });

      mockOctokit.rest.checks.create.mockResolvedValue({
        data: { html_url: "https://github.com/owner/repo/runs/123" },
      });

      await labeledChecksService.postAnnotations(
        analysis,
        createMockGatingResult(),
        annotations,
      );

      expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith({
        owner: "testowner",
        repo: "testrepo",
        name: "Coverage Treemap Action: Frontend",
        head_sha: "test-head-sha",
        status: "completed",
        conclusion: "success",
        details_url: "https://github.com/testowner/testrepo/pull/123",
        output: {
          title: "Coverage: 85% (1/1 files)",
          summary: expect.stringContaining("## Coverage Analysis Summary"),
          annotations: annotations,
        },
      });

      // Restore original environment
      if (originalGitHubRunId !== undefined) {
        process.env.GITHUB_RUN_ID = originalGitHubRunId;
      }
    });

    it("should use actions URL when GITHUB_RUN_ID is present", async () => {
      // Mock environment with GITHUB_RUN_ID
      const originalGitHubRunId = process.env.GITHUB_RUN_ID;
      process.env.GITHUB_RUN_ID = "17025947211";

      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
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
      };

      const annotations = [
        {
          path: "src/test.ts",
          start_line: 1,
          end_line: 1,
          annotation_level: "warning" as const,
          title: "Test",
          message: "Test message",
        },
      ];

      // Mock GitHub App authentication flow
      mockAppAuth
        .mockResolvedValueOnce({ token: "app-token" })
        .mockResolvedValueOnce({ token: "installation-token" });

      mockOctokit.rest.apps.getRepoInstallation.mockResolvedValue({
        data: { id: 12345 },
      });

      mockOctokit.rest.checks.create.mockResolvedValue({
        data: { html_url: "https://github.com/owner/repo/runs/123" },
      });

      await checksService.postAnnotations(
        analysis,
        createMockGatingResult(),
        annotations,
      );

      expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith({
        owner: "testowner",
        repo: "testrepo",
        name: "Coverage Treemap Action",
        head_sha: "test-head-sha",
        status: "completed",
        conclusion: "success",
        details_url:
          "https://github.com/testowner/testrepo/actions/runs/17025947211",
        output: {
          title: "Coverage: 85% (1/1 files)",
          summary: expect.stringContaining("## Coverage Analysis Summary"),
          annotations: annotations,
        },
      });

      // Restore original environment
      if (originalGitHubRunId !== undefined) {
        process.env.GITHUB_RUN_ID = originalGitHubRunId;
      } else {
        delete process.env.GITHUB_RUN_ID;
      }
    });

    it("should handle authentication errors", async () => {
      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
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
      };

      mockAppAuth.mockRejectedValue(new Error("Authentication failed"));

      await expect(
        checksService.postAnnotations(analysis, createMockGatingResult(), []),
      ).rejects.toThrow("Authentication failed");

      expect(mockedCore.warning).toHaveBeenCalledWith(
        "Failed to post check annotations: Authentication failed",
      );
    });

    it("should limit annotations to maxAnnotations", async () => {
      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
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
      };

      // Create 60 annotations (more than maxAnnotations = 50)
      const annotations = Array(60)
        .fill(null)
        .map((_, i) => ({
          path: "src/test.ts",
          start_line: i + 1,
          end_line: i + 1,
          annotation_level: "warning" as const,
          title: "Test",
          message: `Test message ${i}`,
        }));

      // Mock GitHub App authentication flow
      mockAppAuth
        .mockResolvedValueOnce({ token: "app-token" })
        .mockResolvedValueOnce({ token: "installation-token" });

      mockOctokit.rest.apps.getRepoInstallation.mockResolvedValue({
        data: { id: 12345 },
      });

      mockOctokit.rest.checks.create.mockResolvedValue({
        data: { html_url: "https://github.com/owner/repo/runs/123" },
      });

      await checksService.postAnnotations(
        analysis,
        createMockGatingResult(),
        annotations,
      );

      const createCallArgs = mockOctokit.rest.checks.create.mock.calls[0][0];
      expect(createCallArgs.output.annotations).toHaveLength(50); // Limited to maxAnnotations
      expect(mockedCore.info).toHaveBeenCalledWith(
        "✅ Posted 60 annotations to GitHub Checks",
      );
    });

    it("should log PR comment URL when provided", async () => {
      const prCommentUrl =
        "https://github.com/owner/repo/pull/123#issuecomment-456";
      const annotations: CheckAnnotation[] = [
        {
          path: "src/test.ts",
          start_line: 1,
          end_line: 1,
          annotation_level: "warning",
          message: "Test annotation",
        },
      ];

      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
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
      };

      mockAppAuth
        .mockResolvedValueOnce({ token: "app-token" })
        .mockResolvedValueOnce({ token: "installation-token" });

      mockOctokit.rest.apps.getRepoInstallation.mockResolvedValue({
        data: { id: 12345 },
      });

      mockOctokit.rest.checks.create.mockResolvedValue({
        data: { html_url: "https://github.com/owner/repo/runs/123" },
      });

      await checksService.postAnnotations(
        analysis,
        createMockGatingResult(),
        annotations,
        prCommentUrl,
      );
    });

    it("should not log PR comment URL when not provided", async () => {
      const annotations: CheckAnnotation[] = [
        {
          path: "src/test.ts",
          start_line: 1,
          end_line: 1,
          annotation_level: "warning",
          message: "Test annotation",
        },
      ];

      const analysis: CoverageAnalysis = {
        changeset: ChangesetUtils.createChangeset(
          ["src/test.ts"],
          "base-sha",
          "head-sha",
          "main",
        ),
        changedFiles: [],
        summary: {
          totalChangedFiles: 1,
          filesWithCoverage: 1,
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
      };

      mockAppAuth
        .mockResolvedValueOnce({ token: "app-token" })
        .mockResolvedValueOnce({ token: "installation-token" });

      mockOctokit.rest.apps.getRepoInstallation.mockResolvedValue({
        data: { id: 12345 },
      });

      mockOctokit.rest.checks.create.mockResolvedValue({
        data: { html_url: "https://github.com/owner/repo/runs/123" },
      });

      await checksService.postAnnotations(
        analysis,
        createMockGatingResult(),
        annotations,
      );

      expect(mockedCore.info).not.toHaveBeenCalledWith(
        expect.stringContaining("💬 View PR comment:"),
      );
    });
  });
});
