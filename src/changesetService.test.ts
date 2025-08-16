import { ChangesetService } from "./changesetService";
import { GitUtils } from "./git";
import { ChangesetUtils } from "./changeset";
import * as core from "@actions/core";

// Mock dependencies
jest.mock("../src/git");
jest.mock("../src/changeset");
jest.mock("@actions/core");

const mockedGitUtils = GitUtils as jest.Mocked<typeof GitUtils>;
const mockedChangesetUtils = ChangesetUtils as jest.Mocked<
  typeof ChangesetUtils
>;
const mockedCore = core as jest.Mocked<typeof core>;

describe("ChangesetService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("detectChanges", () => {
    it("should detect changes with default target branch", async () => {
      const mockMergeBase = "abc123";
      const mockChangedFiles = ["src/file1.ts", "src/file2.js"];
      const mockChangeset = {
        baseCommit: mockMergeBase,
        headCommit: "HEAD",
        targetBranch: "main",
        files: [
          { path: "src/file1.ts", status: "modified" as const },
          { path: "src/file2.js", status: "modified" as const },
        ],
        totalFiles: 2,
      };

      mockedGitUtils.ensureBaseRef.mockResolvedValue();
      mockedGitUtils.findMergeBase.mockResolvedValue(mockMergeBase);
      mockedGitUtils.getChangedFiles.mockResolvedValue(mockChangedFiles);
      mockedChangesetUtils.createChangeset.mockReturnValue(mockChangeset);
      mockedChangesetUtils.getSummary.mockReturnValue(
        "2 files changed compared to main",
      );

      const result = await ChangesetService.detectChanges(
        mockChangeset.targetBranch,
      );

      expect(result).toBe(mockChangeset);
      expect(mockedGitUtils.ensureBaseRef).toHaveBeenCalledWith("origin/main");
      expect(mockedGitUtils.findMergeBase).toHaveBeenCalledWith(
        "origin/main",
        "HEAD",
      );
      expect(mockedGitUtils.getChangedFiles).toHaveBeenCalledWith(
        mockMergeBase,
        "HEAD",
      );
      expect(mockedChangesetUtils.createChangeset).toHaveBeenCalledWith(
        mockChangedFiles,
        mockMergeBase,
        "HEAD",
        "main",
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "🚀 Starting changeset detection",
      );
      expect(mockedCore.info).toHaveBeenCalledWith("🎯 Target branch: main");
      expect(mockedCore.info).toHaveBeenCalledWith(
        "✅ Changeset detection completed",
      );
    });

    it("should detect changes with custom target branch", async () => {
      const mockMergeBase = "def456";
      const mockChangedFiles = ["src/component.tsx"];
      const mockChangeset = {
        baseCommit: mockMergeBase,
        headCommit: "HEAD",
        targetBranch: "develop",
        files: [{ path: "src/component.tsx", status: "modified" as const }],
        totalFiles: 1,
      };

      mockedGitUtils.ensureBaseRef.mockResolvedValue();
      mockedGitUtils.findMergeBase.mockResolvedValue(mockMergeBase);
      mockedGitUtils.getChangedFiles.mockResolvedValue(mockChangedFiles);
      mockedChangesetUtils.createChangeset.mockReturnValue(mockChangeset);
      mockedChangesetUtils.getSummary.mockReturnValue(
        "1 file changed compared to develop",
      );

      const result = await ChangesetService.detectChanges("develop");

      expect(result).toBe(mockChangeset);
      expect(mockedGitUtils.ensureBaseRef).toHaveBeenCalledWith(
        "origin/develop",
      );
      expect(mockedGitUtils.findMergeBase).toHaveBeenCalledWith(
        "origin/develop",
        "HEAD",
      );
      expect(mockedChangesetUtils.createChangeset).toHaveBeenCalledWith(
        mockChangedFiles,
        mockMergeBase,
        "HEAD",
        "develop",
      );
      expect(mockedCore.info).toHaveBeenCalledWith("🎯 Target branch: develop");
    });

    it("should handle git operation failures", async () => {
      const error = new Error("Git operation failed");
      mockedGitUtils.ensureBaseRef.mockRejectedValue(error);

      await expect(ChangesetService.detectChanges("main")).rejects.toThrow(
        "Failed to detect changes in pull request",
      );

      expect(mockedCore.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to detect changes in pull request"),
      );
    });

    it("should handle merge base failure", async () => {
      const error = new Error("Merge base failed");
      mockedGitUtils.ensureBaseRef.mockResolvedValue();
      mockedGitUtils.findMergeBase.mockRejectedValue(error);

      await expect(ChangesetService.detectChanges("main")).rejects.toThrow(
        "Failed to detect changes in pull request",
      );
    });

    it("should handle changed files failure", async () => {
      const error = new Error("Changed files failed");
      mockedGitUtils.ensureBaseRef.mockResolvedValue();
      mockedGitUtils.findMergeBase.mockResolvedValue("abc123");
      mockedGitUtils.getChangedFiles.mockRejectedValue(error);

      await expect(ChangesetService.detectChanges("main")).rejects.toThrow(
        "Failed to detect changes in pull request",
      );
    });
  });

  describe("detectCodeChanges", () => {
    it("should filter changeset for code files with default extensions", async () => {
      const originalChangeset = {
        baseCommit: "abc123",
        headCommit: "HEAD",
        targetBranch: "main",
        files: [
          { path: "src/file.ts", status: "modified" as const },
          { path: "README.md", status: "modified" as const },
        ],
        totalFiles: 2,
      };

      const filteredChangeset = {
        baseCommit: "abc123",
        headCommit: "HEAD",
        targetBranch: "main",
        files: [{ path: "src/file.ts", status: "modified" as const }],
        totalFiles: 1,
      };

      // Mock the detectChanges method
      jest
        .spyOn(ChangesetService, "detectChanges")
        .mockResolvedValue(originalChangeset);
      mockedChangesetUtils.filterByExtensions.mockReturnValue(
        filteredChangeset,
      );

      const result = await ChangesetService.detectCodeChanges(
        originalChangeset.targetBranch,
      );

      expect(result).toBe(filteredChangeset);
      expect(ChangesetService.detectChanges).toHaveBeenCalledWith(
        originalChangeset.targetBranch,
      );
      expect(mockedChangesetUtils.filterByExtensions).toHaveBeenCalledWith(
        originalChangeset,
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

    it("should filter changeset with custom extensions", async () => {
      const originalChangeset = {
        baseCommit: "abc123",
        headCommit: "HEAD",
        targetBranch: "develop",
        files: [
          { path: "src/file.ts", status: "modified" as const },
          { path: "src/file.py", status: "modified" as const },
        ],
        totalFiles: 2,
      };

      const filteredChangeset = {
        baseCommit: "abc123",
        headCommit: "HEAD",
        targetBranch: "develop",
        files: [{ path: "src/file.py", status: "modified" as const }],
        totalFiles: 1,
      };

      jest
        .spyOn(ChangesetService, "detectChanges")
        .mockResolvedValue(originalChangeset);
      mockedChangesetUtils.filterByExtensions.mockReturnValue(
        filteredChangeset,
      );

      const result = await ChangesetService.detectCodeChanges("develop", [
        ".py",
      ]);

      expect(result).toBe(filteredChangeset);
      expect(ChangesetService.detectChanges).toHaveBeenCalledWith("develop");
      expect(mockedChangesetUtils.filterByExtensions).toHaveBeenCalledWith(
        originalChangeset,
        [".py"],
      );
    });
  });

  describe("outputChangeset", () => {
    it("should set GitHub Actions outputs and log changeset details", () => {
      const changeset = {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [
          { path: "src/file1.ts", status: "modified" as const },
          { path: "src/file2.js", status: "modified" as const },
        ],
        totalFiles: 2,
      };

      const formattedChangeset = "Formatted changeset output";
      mockedChangesetUtils.format.mockReturnValue(formattedChangeset);

      ChangesetService.outputChangeset(changeset);

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
        "abc123",
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "head-commit",
        "def456",
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "target-branch",
        "main",
      );

      expect(mockedCore.info).toHaveBeenCalledWith(
        "📤 Setting GitHub Actions outputs",
      );
      expect(mockedCore.info).toHaveBeenCalledWith("📋 Changeset Details:");
      expect(mockedChangesetUtils.format).toHaveBeenCalledWith(changeset);
    });

    it("should handle empty changeset", () => {
      const changeset = {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [],
        totalFiles: 0,
      };

      const formattedChangeset = "No files changed";
      mockedChangesetUtils.format.mockReturnValue(formattedChangeset);

      ChangesetService.outputChangeset(changeset);

      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "changed-files-count",
        0,
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith("changed-files", "");
      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "base-commit",
        "abc123",
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "head-commit",
        "def456",
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "target-branch",
        "main",
      );
    });

    it("should handle changeset with single file", () => {
      const changeset = {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "develop",
        files: [{ path: "src/component.tsx", status: "modified" as const }],
        totalFiles: 1,
      };

      mockedChangesetUtils.format.mockReturnValue("Single file changeset");

      ChangesetService.outputChangeset(changeset);

      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "changed-files-count",
        1,
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "changed-files",
        "src/component.tsx",
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith(
        "target-branch",
        "develop",
      );
    });
  });
});
