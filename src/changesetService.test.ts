import { ChangesetService } from "./changesetService";
import { GitUtils } from "./git";
import { ChangesetUtils } from "./changeset";
import * as core from "@actions/core";

// Mock dependencies
jest.mock("./git");
jest.mock("./changeset");
jest.mock("@actions/core");
jest.mock("@actions/github", () => ({
  context: {
    payload: {},
  },
}));

const mockedGitUtils = GitUtils as jest.Mocked<typeof GitUtils>;
const mockedChangesetUtils = ChangesetUtils as jest.Mocked<
  typeof ChangesetUtils
>;
const mockedCore = core as jest.Mocked<typeof core>;

// Import the mocked context
import { context } from "@actions/github";

describe("ChangesetService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset GitHub context mock
    (context as unknown as { payload: object }).payload = {};
  });

  describe("detectChanges", () => {
    it("should detect changes using GitHub context SHAs", async () => {
      const mockPrHeadSha = "pr-head-sha123";
      const mockPrBaseSha = "pr-base-sha456";
      const mockChangedFiles = ["src/file1.ts", "src/file2.js"];
      const mockChangeset = {
        baseCommit: mockPrBaseSha,
        headCommit: mockPrHeadSha,
        targetBranch: "main",
        files: [
          { path: "src/file1.ts", status: "modified" as const },
          { path: "src/file2.js", status: "modified" as const },
        ],
        totalFiles: 2,
      };

      mockedGitUtils.getPullRequestHead.mockReturnValue(mockPrHeadSha);
      mockedGitUtils.getPullRequestBase.mockReturnValue(mockPrBaseSha);
      mockedGitUtils.getChangedFiles.mockResolvedValue(mockChangedFiles);
      mockedChangesetUtils.createChangeset.mockReturnValue(mockChangeset);
      mockedChangesetUtils.getSummary.mockReturnValue(
        "2 files changed compared to main",
      );

      const result = await ChangesetService.detectChanges("main");

      expect(result).toBe(mockChangeset);
      expect(mockedGitUtils.getPullRequestHead).toHaveBeenCalled();
      expect(mockedGitUtils.getPullRequestBase).toHaveBeenCalled();
      expect(mockedGitUtils.getChangedFiles).toHaveBeenCalledWith(
        mockPrBaseSha,
        mockPrHeadSha,
      );
      expect(mockedChangesetUtils.createChangeset).toHaveBeenCalledWith(
        mockChangedFiles,
        mockPrBaseSha,
        mockPrHeadSha,
        "main",
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "🚀 Starting changeset detection",
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        `📌 PR head: ${mockPrHeadSha}`,
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        `🎯 PR base: ${mockPrBaseSha}`,
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "✅ Changeset detection completed",
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "2 files changed compared to main",
      );
    });

    it("should handle git command failures", async () => {
      const error = new Error("Git command failed");
      mockedGitUtils.getPullRequestHead.mockReturnValue("head-sha");
      mockedGitUtils.getPullRequestBase.mockReturnValue("base-sha");
      mockedGitUtils.getChangedFiles.mockRejectedValue(error);

      await expect(ChangesetService.detectChanges("main")).rejects.toThrow(
        "Failed to detect changes in pull request",
      );

      expect(mockedCore.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to detect changes in pull request"),
      );
    });

    it("should handle getPullRequestHead failures", async () => {
      const error = new Error("PR head SHA not available");
      mockedGitUtils.getPullRequestHead.mockImplementation(() => {
        throw error;
      });

      await expect(ChangesetService.detectChanges("main")).rejects.toThrow(
        "Failed to detect changes in pull request",
      );

      expect(mockedCore.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to detect changes in pull request"),
      );
    });

    it("should handle getPullRequestBase failures", async () => {
      const error = new Error("PR base SHA not available");
      mockedGitUtils.getPullRequestHead.mockReturnValue("head-sha");
      mockedGitUtils.getPullRequestBase.mockImplementation(() => {
        throw error;
      });

      await expect(ChangesetService.detectChanges("main")).rejects.toThrow(
        "Failed to detect changes in pull request",
      );

      expect(mockedCore.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to detect changes in pull request"),
      );
    });
  });

  describe("detectCodeChanges", () => {
    it("should filter changeset by default code extensions", async () => {
      const mockChangeset = {
        baseCommit: "base-sha",
        headCommit: "head-sha",
        targetBranch: "main",
        files: [
          { path: "src/file1.ts", status: "modified" as const },
          { path: "src/file2.js", status: "modified" as const },
        ],
        totalFiles: 2,
      };
      const mockFilteredChangeset = {
        ...mockChangeset,
        files: [{ path: "src/file1.ts", status: "modified" as const }],
        totalFiles: 1,
      };

      mockedGitUtils.getPullRequestHead.mockReturnValue("head-sha");
      mockedGitUtils.getPullRequestBase.mockReturnValue("base-sha");
      mockedGitUtils.getChangedFiles.mockResolvedValue([
        "src/file1.ts",
        "src/file2.js",
      ]);
      mockedChangesetUtils.createChangeset.mockReturnValue(mockChangeset);
      mockedChangesetUtils.getSummary.mockReturnValue("summary");
      mockedChangesetUtils.filterByExtensions.mockReturnValue(
        mockFilteredChangeset,
      );

      const result = await ChangesetService.detectCodeChanges("main");

      expect(result).toBe(mockFilteredChangeset);
      expect(mockedChangesetUtils.filterByExtensions).toHaveBeenCalledWith(
        mockChangeset,
        [
          ".ts",
          ".js",
          ".tsx",
          ".jsx",
          ".py",
          ".java",
          ".cs",
          ".cpp",
          ".c",
          ".go",
          ".rs",
        ],
      );
    });

    it("should filter changeset by custom extensions", async () => {
      const mockChangeset = {
        baseCommit: "base-sha",
        headCommit: "head-sha",
        targetBranch: "main",
        files: [{ path: "src/file1.py", status: "modified" as const }],
        totalFiles: 1,
      };

      mockedGitUtils.getPullRequestHead.mockReturnValue("head-sha");
      mockedGitUtils.getPullRequestBase.mockReturnValue("base-sha");
      mockedGitUtils.getChangedFiles.mockResolvedValue(["src/file1.py"]);
      mockedChangesetUtils.createChangeset.mockReturnValue(mockChangeset);
      mockedChangesetUtils.getSummary.mockReturnValue("summary");
      mockedChangesetUtils.filterByExtensions.mockReturnValue(mockChangeset);

      await ChangesetService.detectCodeChanges("main", [".py"]);

      expect(mockedChangesetUtils.filterByExtensions).toHaveBeenCalledWith(
        mockChangeset,
        [".py"],
      );
    });
  });

  describe("outputChangeset", () => {
    it("should set GitHub Actions outputs and log changeset details", () => {
      const mockChangeset = {
        baseCommit: "base-sha123",
        headCommit: "head-sha456",
        targetBranch: "main",
        files: [
          { path: "src/file1.ts", status: "modified" as const },
          { path: "src/file2.js", status: "added" as const },
        ],
        totalFiles: 2,
      };
      const mockFormattedChangeset = "Formatted changeset details";

      mockedChangesetUtils.format.mockReturnValue(mockFormattedChangeset);

      ChangesetService.outputChangeset(mockChangeset);

      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "changed-files-count",
        2,
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "changed-files",
        "src/file1.ts,src/file2.js",
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "base-commit",
        "base-sha123",
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "head-commit",
        "head-sha456",
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "target-branch",
        "main",
      );

      expect(mockedCore.info).toHaveBeenCalledWith(
        "📤 Setting GitHub Actions outputs",
      );
      expect(mockedCore.info).toHaveBeenCalledWith("📋 Changeset Details:");
      expect(mockedCore.info).toHaveBeenCalledWith(mockFormattedChangeset);
    });

    it("should handle empty changeset", () => {
      const mockChangeset = {
        baseCommit: "base-sha",
        headCommit: "head-sha",
        targetBranch: "main",
        files: [],
        totalFiles: 0,
      };

      mockedChangesetUtils.format.mockReturnValue("No files changed");

      ChangesetService.outputChangeset(mockChangeset);

      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "changed-files-count",
        0,
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith("changed-files", "");
    });
  });
});
