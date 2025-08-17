import { ChecksService, ChecksServiceConfig } from "./checksService";
import { CoverageAnalysis, FileChangeWithCoverage } from "./coverageAnalyzer";
import { ChangesetUtils } from "./changeset";

// Mock createAppAuth
jest.mock("@octokit/auth-app");

describe("ChecksService", () => {
  let checksService: ChecksService;
  const mockConfig: ChecksServiceConfig = {
    githubAppId: "123456",
    githubAppPrivateKey:
      "-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----",
    githubToken: "ghp_token",
    coverageThreshold: 80,
  };

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
  });
});
