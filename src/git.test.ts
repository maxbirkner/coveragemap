import { GitUtils } from "./git";
import { exec } from "child_process";
import * as core from "@actions/core";

// Mock child_process, @actions/core, and @actions/github
jest.mock("child_process");
jest.mock("@actions/core");
jest.mock("@actions/github", () => ({
  context: {
    payload: {},
  },
}));

const mockedExec = exec as jest.MockedFunction<typeof exec>;
const mockedCore = core as jest.Mocked<typeof core>;

import { context } from "@actions/github";

// Helper to mock exec with specific stdout/stderr
const mockExecSuccess = (stdout: string, stderr: string = "") => {
  mockedExec.mockImplementation(((command: string, callback: any) => {
    callback(null, { stdout, stderr });
  }) as any);
};

const mockExecError = (error: Error) => {
  mockedExec.mockImplementation(((command: string, callback: any) => {
    callback(error, { stdout: "", stderr: "" });
  }) as any);
};

describe("GitUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getCurrentCommit", () => {
    it("should return current commit SHA", async () => {
      mockExecSuccess("abc123def456\n");

      const result = await GitUtils.getCurrentCommit();

      expect(result).toBe("abc123def456");
      expect(mockedExec).toHaveBeenCalledWith(
        "git rev-parse HEAD",
        expect.any(Function),
      );
    });

    it("should trim whitespace from commit SHA", async () => {
      mockExecSuccess("  abc123def456  \n");

      const result = await GitUtils.getCurrentCommit();

      expect(result).toBe("abc123def456");
    });

    it("should throw error when command fails", async () => {
      const error = new Error("Command failed");
      mockExecError(error);

      await expect(GitUtils.getCurrentCommit()).rejects.toThrow(
        "Failed to get current commit",
      );
    });
  });

  describe("getPullRequestHead", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.GITHUB_SHA;
      delete process.env.GITHUB_HEAD_SHA;
      delete process.env.GITHUB_EVENT_HEAD_SHA;

      // Reset GitHub context mock
      (context as any).payload = {};
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should use GitHub context PR head when available", async () => {
      // Mock GitHub context with PR payload
      (context as any).payload = {
        pull_request: {
          head: {
            sha: "context-pr-head-sha",
          },
        },
      };

      const result = await GitUtils.getPullRequestHead();

      expect(result).toBe("context-pr-head-sha");
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📌 Using PR head from GitHub context: context-pr-head-sha",
      );
    });

    it("should detect merge commit and return PR head even with GITHUB_SHA", async () => {
      process.env.GITHUB_SHA = "github-sha-123";

      // Mock git rev-parse HEAD
      mockedExec
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, { stdout: "merge-commit-sha", stderr: "" });
        }) as any)
        // Mock git rev-list --parents
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, {
            stdout: "merge-commit-sha parent1-sha parent2-sha\n",
            stderr: "",
          });
        }) as any);

      const result = await GitUtils.getPullRequestHead();

      expect(result).toBe("parent2-sha");
      expect(mockedCore.info).toHaveBeenCalledWith(
        "🔀 Detected merge commit with parents: parent1-sha, parent2-sha",
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📍 Using PR head commit: parent2-sha",
      );
    });

    it("should use GitHub event head SHA when available in merge commit", async () => {
      process.env.GITHUB_HEAD_SHA = "event-head-sha-123";

      // Mock git rev-parse HEAD
      mockedExec
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, { stdout: "merge-commit-sha", stderr: "" });
        }) as any)
        // Mock git rev-list --parents
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, {
            stdout: "merge-commit-sha parent1-sha parent2-sha\n",
            stderr: "",
          });
        }) as any);

      const result = await GitUtils.getPullRequestHead();

      expect(result).toBe("event-head-sha-123");
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📌 Using PR head from GitHub event: event-head-sha-123",
      );
    });

    it("should use GITHUB_SHA when not a merge commit", async () => {
      process.env.GITHUB_SHA = "github-sha-123";

      // Mock git rev-parse HEAD
      mockedExec
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, { stdout: "regular-commit-sha", stderr: "" });
        }) as any)
        // Mock git rev-list --parents (single parent)
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, {
            stdout: "regular-commit-sha parent-sha\n",
            stderr: "",
          });
        }) as any);

      const result = await GitUtils.getPullRequestHead();

      expect(result).toBe("github-sha-123");
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📌 Using GITHUB_SHA: github-sha-123",
      );
    });

    it("should detect merge commit and return PR head", async () => {
      // Mock git rev-parse HEAD
      mockedExec
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, { stdout: "merge-commit-sha", stderr: "" });
        }) as any)
        // Mock git rev-list --parents
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, {
            stdout: "merge-commit-sha parent1-sha parent2-sha\n",
            stderr: "",
          });
        }) as any);

      const result = await GitUtils.getPullRequestHead();

      expect(result).toBe("parent2-sha");
      expect(mockedCore.info).toHaveBeenCalledWith(
        "🔀 Detected merge commit with parents: parent1-sha, parent2-sha",
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📍 Using PR head commit: parent2-sha",
      );
    });

    it("should return current commit when not a merge commit", async () => {
      // Mock git rev-parse HEAD
      mockedExec
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, { stdout: "regular-commit-sha", stderr: "" });
        }) as any)
        // Mock git rev-list --parents (single parent)
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, {
            stdout: "regular-commit-sha parent-sha\n",
            stderr: "",
          });
        }) as any);

      const result = await GitUtils.getPullRequestHead();

      expect(result).toBe("regular-commit-sha");
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📍 Using current HEAD as PR head: regular-commit-sha",
      );
    });

    it("should handle git command failures gracefully", async () => {
      const error = new Error("Git command failed");
      mockExecError(error);

      const result = await GitUtils.getPullRequestHead();

      expect(result).toBeNull();
      expect(mockedCore.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to determine PR head, falling back to HEAD",
        ),
      );
    });
  });

  describe("findMergeBase", () => {
    it("should return merge base SHA", async () => {
      const expectedSha = "abc123def456";
      mockExecSuccess(`${expectedSha}\n`);

      const result = await GitUtils.findMergeBase("origin/main", "HEAD");

      expect(result).toBe(expectedSha);
      expect(mockedExec).toHaveBeenCalledWith(
        "git merge-base origin/main HEAD",
        expect.any(Function),
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "🔍 Finding merge base between origin/main and HEAD",
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        `📍 Merge base found: ${expectedSha}`,
      );
    });

    it("should trim whitespace from merge base SHA", async () => {
      const sha = "abc123def456";
      mockExecSuccess(`  ${sha}  \n`);

      const result = await GitUtils.findMergeBase("origin/main", "HEAD");

      expect(result).toBe(sha);
    });

    it("should throw error when git command fails", async () => {
      const error = new Error("Command failed");
      mockExecError(error);

      await expect(
        GitUtils.findMergeBase("origin/main", "HEAD"),
      ).rejects.toThrow(
        "Failed to find merge base between origin/main and HEAD",
      );

      expect(mockedCore.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to find merge base between origin/main and HEAD",
        ),
      );
    });

    it("should fallback to alternative references when origin/main fails in CI", async () => {
      const expectedSha = "abc123def456";

      // First attempt with origin/main fails
      mockedExec
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("No such ref"), { stdout: "", stderr: "" });
        }) as any)
        // Second attempt with main succeeds
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, { stdout: `${expectedSha}\n`, stderr: "" });
        }) as any);

      const result = await GitUtils.findMergeBase("origin/main", "HEAD");

      expect(result).toBe(expectedSha);
      expect(mockedExec).toHaveBeenCalledWith(
        "git merge-base origin/main HEAD",
        expect.any(Function),
      );
      expect(mockedExec).toHaveBeenCalledWith(
        "git merge-base main HEAD",
        expect.any(Function),
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📍 Merge base found with main: abc123def456",
      );
    });
  });

  describe("getChangedFiles", () => {
    it("should return array of changed files", async () => {
      const gitOutput = "src/file1.ts\nsrc/file2.js\ntest/file.test.ts\n";
      mockExecSuccess(gitOutput);

      const result = await GitUtils.getChangedFiles("abc123", "HEAD");

      expect(result).toEqual([
        "src/file1.ts",
        "src/file2.js",
        "test/file.test.ts",
      ]);
      expect(mockedExec).toHaveBeenCalledWith(
        "git diff --name-only --diff-filter=AM abc123..HEAD",
        expect.any(Function),
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📂 Getting changed files between abc123 and HEAD",
      );
      expect(mockedCore.info).toHaveBeenCalledWith("📊 Found 3 changed files");
    });

    it("should filter out empty lines", async () => {
      const gitOutput = "src/file1.ts\n\nsrc/file2.js\n\n\n";
      mockExecSuccess(gitOutput);

      const result = await GitUtils.getChangedFiles("abc123");

      expect(result).toEqual(["src/file1.ts", "src/file2.js"]);
    });

    it("should return empty array when no files changed", async () => {
      mockExecSuccess("");

      const result = await GitUtils.getChangedFiles("abc123");

      expect(result).toEqual([]);
      expect(mockedCore.info).toHaveBeenCalledWith("📊 Found 0 changed files");
    });

    it("should use HEAD as default head parameter", async () => {
      mockExecSuccess("src/file.ts\n");

      await GitUtils.getChangedFiles("abc123");

      expect(mockedExec).toHaveBeenCalledWith(
        "git diff --name-only --diff-filter=AM abc123..HEAD",
        expect.any(Function),
      );
    });

    it("should throw error when git diff fails", async () => {
      const error = new Error("Git diff failed");
      mockExecError(error);

      await expect(GitUtils.getChangedFiles("abc123", "HEAD")).rejects.toThrow(
        "Failed to get changed files between abc123 and HEAD",
      );

      expect(mockedCore.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to get changed files between abc123 and HEAD",
        ),
      );
    });
  });

  describe("ensureBaseRef", () => {
    it("should skip fetch if reference already exists locally", async () => {
      // First call to check if ref exists - succeeds
      mockedExec.mockImplementationOnce(((command: string, callback: any) => {
        callback(null, { stdout: "abc123", stderr: "" });
      }) as any);

      await GitUtils.ensureBaseRef("origin/main");

      expect(mockedExec).toHaveBeenCalledWith(
        "git rev-parse --verify origin/main",
        expect.any(Function),
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "✅ Reference origin/main already exists locally",
      );
    });

    it("should fetch reference if it doesn't exist locally", async () => {
      // First call to check if ref exists - fails
      mockedExec
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("Reference not found"), {
            stdout: "",
            stderr: "",
          });
        }) as any)
        // Try alternative references - all fail
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("Reference not found"), {
            stdout: "",
            stderr: "",
          });
        }) as any)
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("Reference not found"), {
            stdout: "",
            stderr: "",
          });
        }) as any)
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("Reference not found"), {
            stdout: "",
            stderr: "",
          });
        }) as any)
        // Fetch call - succeeds
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, { stdout: "", stderr: "" });
        }) as any);

      await GitUtils.ensureBaseRef("origin/main");

      expect(mockedExec).toHaveBeenCalledWith(
        "git rev-parse --verify origin/main",
        expect.any(Function),
      );
      expect(mockedExec).toHaveBeenCalledWith(
        "git fetch origin main",
        expect.any(Function),
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📥 Fetching main from origin",
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "✅ Successfully fetched main from origin",
      );
    });

    it("should handle complex branch names with slashes", async () => {
      // First call fails, second succeeds
      mockedExec
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("Reference not found"), {
            stdout: "",
            stderr: "",
          });
        }) as any)
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(null, { stdout: "", stderr: "" });
        }) as any);

      await GitUtils.ensureBaseRef("origin/feature/complex-branch");

      expect(mockedExec).toHaveBeenCalledWith(
        "git fetch origin feature/complex-branch",
        expect.any(Function),
      );
    });

    it("should handle fetch failure gracefully", async () => {
      // First call fails (rev-parse), subsequent alternatives fail, fetch calls also fail
      mockedExec
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("Reference not found"), {
            stdout: "",
            stderr: "",
          });
        }) as any)
        // Alternative refs fail
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("Reference not found"), {
            stdout: "",
            stderr: "",
          });
        }) as any)
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("Reference not found"), {
            stdout: "",
            stderr: "",
          });
        }) as any)
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("Reference not found"), {
            stdout: "",
            stderr: "",
          });
        }) as any)
        // First fetch fails
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("Git diff failed"), { stdout: "", stderr: "" });
        }) as any)
        // General fetch also fails
        .mockImplementationOnce(((command: string, callback: any) => {
          callback(new Error("Git diff failed"), { stdout: "", stderr: "" });
        }) as any);

      // Should not throw, but log warning
      await expect(
        GitUtils.ensureBaseRef("origin/main"),
      ).resolves.not.toThrow();

      expect(mockedCore.warning).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch main from origin"),
      );
    });

    it("should handle malformed reference names", async () => {
      // First call fails
      mockedExec.mockImplementationOnce(((command: string, callback: any) => {
        callback(new Error("Reference not found"), { stdout: "", stderr: "" });
      }) as any);

      await GitUtils.ensureBaseRef("malformed-ref");

      expect(mockedCore.warning).toHaveBeenCalledWith(
        "⚠️ Could not parse remote/branch from malformed-ref, assuming it's already available",
      );
    });
  });

  describe("getCurrentBranch", () => {
    it("should return current branch name", async () => {
      mockExecSuccess("feature/my-branch\n");

      const result = await GitUtils.getCurrentBranch();

      expect(result).toBe("feature/my-branch");
      expect(mockedExec).toHaveBeenCalledWith(
        "git rev-parse --abbrev-ref HEAD",
        expect.any(Function),
      );
    });

    it("should trim whitespace from branch name", async () => {
      mockExecSuccess("  main  \n");

      const result = await GitUtils.getCurrentBranch();

      expect(result).toBe("main");
    });

    it("should throw error when command fails", async () => {
      const error = new Error("Command failed");
      mockExecError(error);

      await expect(GitUtils.getCurrentBranch()).rejects.toThrow(
        "Failed to get current branch",
      );

      expect(mockedCore.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to get current branch"),
      );
    });
  });
});
