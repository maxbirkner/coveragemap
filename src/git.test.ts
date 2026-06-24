/* eslint-disable @typescript-eslint/no-explicit-any */
import { GitUtils } from "./git";
import { execFile } from "child_process";
import * as core from "@actions/core";

// Mock child_process, @actions/core, and @actions/github
jest.mock("child_process");
jest.mock("@actions/core");
jest.mock("@actions/github", () => ({
  context: {
    payload: {},
  },
}));

const mockedExecFile = execFile as unknown as jest.MockedFunction<any>;
const mockedCore = core as jest.Mocked<typeof core>;

import { context } from "@actions/github";

// Helper to mock execFile with specific stdout/stderr. promisify(execFile)
// invokes it as execFile(file, args, callback).
const mockExecSuccess = (stdout: string, stderr = "") => {
  mockedExecFile.mockImplementation(((
    _file: string,
    _args: string[],
    callback: any,
  ) => {
    callback(null, { stdout, stderr });
  }) as any);
};

const mockExecError = (error: Error) => {
  mockedExecFile.mockImplementation(((
    _file: string,
    _args: string[],
    callback: any,
  ) => {
    callback(error, { stdout: "", stderr: "" });
  }) as any);
};

describe("GitUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset GitHub context mock
    (context as any).payload = {};
  });

  describe("getPullRequestHead", () => {
    it("should use GitHub context PR head SHA when available", async () => {
      (context as any).payload = {
        pull_request: {
          head: { sha: "pr-head-sha123" },
        },
      };

      const result = GitUtils.getPullRequestHead();

      expect(result).toBe("pr-head-sha123");
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📌 Using PR head from GitHub context: pr-head-sha123",
      );
    });

    it("should throw error when GitHub context PR head is not available", () => {
      (context as any).payload = {};

      expect(() => GitUtils.getPullRequestHead()).toThrow(
        "PR head SHA not available in GitHub context",
      );
    });

    it("should throw error when pull_request is null", () => {
      (context as any).payload = { pull_request: null };

      expect(() => GitUtils.getPullRequestHead()).toThrow(
        "PR head SHA not available in GitHub context",
      );
    });

    it("should throw error when head is null", () => {
      (context as any).payload = { pull_request: { head: null } };

      expect(() => GitUtils.getPullRequestHead()).toThrow(
        "PR head SHA not available in GitHub context",
      );
    });
  });

  describe("getPullRequestBase", () => {
    it("should use GitHub context PR base SHA when available", async () => {
      (context as any).payload = {
        pull_request: {
          base: { sha: "pr-base-sha456" },
        },
      };

      const result = GitUtils.getPullRequestBase();

      expect(result).toBe("pr-base-sha456");
      expect(mockedCore.info).toHaveBeenCalledWith(
        "🎯 Using PR base from GitHub context: pr-base-sha456",
      );
    });

    it("should throw error when GitHub context PR base is not available", () => {
      (context as any).payload = {};

      expect(() => GitUtils.getPullRequestBase()).toThrow(
        "PR base SHA not available in GitHub context",
      );
    });

    it("should throw error when pull_request is null", () => {
      (context as any).payload = { pull_request: null };

      expect(() => GitUtils.getPullRequestBase()).toThrow(
        "PR base SHA not available in GitHub context",
      );
    });

    it("should throw error when base is null", () => {
      (context as any).payload = { pull_request: { base: null } };

      expect(() => GitUtils.getPullRequestBase()).toThrow(
        "PR base SHA not available in GitHub context",
      );
    });
  });

  describe("getMergeBase", () => {
    it("should return the merge base SHA when git resolves one", async () => {
      mockExecSuccess("merge-base-sha789\n");

      const result = await GitUtils.getMergeBase("base-sha", "head-sha");

      expect(result).toBe("merge-base-sha789");
      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        ["merge-base", "--", "base-sha", "head-sha"],
        expect.any(Function),
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "🌳 Merge base: merge-base-sha789",
      );
    });

    it("should return null when git produces no output", async () => {
      mockExecSuccess("\n");

      const result = await GitUtils.getMergeBase("base-sha", "head-sha");

      expect(result).toBeNull();
    });

    it("should return null and log debug when git fails (e.g. shallow clone)", async () => {
      mockExecError(new Error("fatal: no merge base"));

      const result = await GitUtils.getMergeBase("base-sha", "head-sha");

      expect(result).toBeNull();
      expect(mockedCore.debug).toHaveBeenCalledWith(
        expect.stringContaining("Could not determine merge base"),
      );
      expect(mockedCore.warning).not.toHaveBeenCalled();
    });
  });

  describe("getChangedFiles", () => {
    it("should return list of changed files", async () => {
      mockExecSuccess("src/file1.ts\nsrc/file2.js\nREADME.md\n");

      const result = await GitUtils.getChangedFiles("base-sha", "head-sha");

      expect(result).toEqual(["src/file1.ts", "src/file2.js", "README.md"]);
      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        ["diff", "--name-only", "--diff-filter=AM", "base-sha..head-sha"],
        expect.any(Function),
      );
      expect(mockedCore.info).toHaveBeenCalledWith(
        "📂 Getting changed files between base-sha and head-sha",
      );
      expect(mockedCore.info).toHaveBeenCalledWith("📊 Found 3 changed files");
    });

    it("should filter out empty lines", async () => {
      mockExecSuccess("src/file1.ts\n\nsrc/file2.js\n  \n\nREADME.md\n");

      const result = await GitUtils.getChangedFiles("base-sha", "head-sha");

      expect(result).toEqual(["src/file1.ts", "src/file2.js", "README.md"]);
    });

    it("should use HEAD as default head parameter", async () => {
      mockExecSuccess("src/file1.ts\n");

      const result = await GitUtils.getChangedFiles("base-sha");

      expect(result).toEqual(["src/file1.ts"]);
      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        ["diff", "--name-only", "--diff-filter=AM", "base-sha..HEAD"],
        expect.any(Function),
      );
    });

    it("should handle empty diff output", async () => {
      mockExecSuccess("");

      const result = await GitUtils.getChangedFiles("base-sha", "head-sha");

      expect(result).toEqual([]);
      expect(mockedCore.info).toHaveBeenCalledWith("📊 Found 0 changed files");
    });

    it("should throw error when git command fails", async () => {
      const error = new Error("Git command failed");
      mockExecError(error);

      await expect(
        GitUtils.getChangedFiles("base-sha", "head-sha"),
      ).rejects.toThrow(
        "Failed to get changed files between base-sha and head-sha",
      );

      expect(mockedCore.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to get changed files"),
      );
    });

    it("should trim whitespace from file paths", async () => {
      mockExecSuccess("  src/file1.ts  \n  src/file2.js  \n");

      const result = await GitUtils.getChangedFiles("base-sha", "head-sha");

      expect(result).toEqual(["src/file1.ts", "src/file2.js"]);
    });

    it("should log each changed file", async () => {
      mockExecSuccess("src/file1.ts\nsrc/file2.js\n");

      await GitUtils.getChangedFiles("base-sha", "head-sha");

      expect(mockedCore.info).toHaveBeenCalledWith("  - src/file1.ts");
      expect(mockedCore.info).toHaveBeenCalledWith("  - src/file2.js");
    });
  });

  describe("getChangedLinesByFile", () => {
    it("should map files to the new-side lines their hunks added", async () => {
      const diff = [
        "diff --git a/src/file1.ts b/src/file1.ts",
        "index 1111111..2222222 100644",
        "--- a/src/file1.ts",
        "+++ b/src/file1.ts",
        "@@ -10,0 +11,3 @@",
        "+const a = 1;",
        "+const b = 2;",
        "+const c = 3;",
        "@@ -20,1 +24,1 @@",
        "-old();",
        "+new();",
        "",
      ].join("\n");
      mockExecSuccess(diff);

      const result = await GitUtils.getChangedLinesByFile("base", "head");

      expect(result.get("src/file1.ts")).toEqual([11, 12, 13, 24]);
      expect(mockedExecFile).toHaveBeenCalledWith(
        "git",
        [
          "-c",
          "diff.noprefix=false",
          "-c",
          "diff.mnemonicPrefix=false",
          "diff",
          "--unified=0",
          "--diff-filter=AM",
          "base..head",
        ],
        expect.any(Function),
      );
    });

    it("should default an omitted hunk count to a single line", async () => {
      const diff = [
        "--- a/src/file2.ts",
        "+++ b/src/file2.ts",
        "@@ -5 +5 @@",
        "-old();",
        "+new();",
        "",
      ].join("\n");
      mockExecSuccess(diff);

      const result = await GitUtils.getChangedLinesByFile("base", "head");

      expect(result.get("src/file2.ts")).toEqual([5]);
    });

    it("should ignore pure deletions that add no new lines", async () => {
      const diff = [
        "--- a/src/file3.ts",
        "+++ b/src/file3.ts",
        "@@ -7,2 +6,0 @@",
        "-removed();",
        "-removed();",
        "",
      ].join("\n");
      mockExecSuccess(diff);

      const result = await GitUtils.getChangedLinesByFile("base", "head");

      expect(result.has("src/file3.ts")).toBe(false);
    });

    it("should track multiple files independently", async () => {
      const diff = [
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -0,0 +1,2 @@",
        "+a();",
        "+a();",
        "--- a/src/b.ts",
        "+++ b/src/b.ts",
        "@@ -0,0 +1 @@",
        "+b();",
        "",
      ].join("\n");
      mockExecSuccess(diff);

      const result = await GitUtils.getChangedLinesByFile("base", "head");

      expect(result.get("src/a.ts")).toEqual([1, 2]);
      expect(result.get("src/b.ts")).toEqual([1]);
    });

    it("should track added files whose header pairs with /dev/null", async () => {
      const diff = [
        "--- /dev/null",
        "+++ b/src/new.ts",
        "@@ -0,0 +1,3 @@",
        "+a();",
        "+b();",
        "+c();",
        "",
      ].join("\n");
      mockExecSuccess(diff);

      const result = await GitUtils.getChangedLinesByFile("base", "head");

      expect(result.get("src/new.ts")).toEqual([1, 2, 3]);
    });

    it("should not treat an added content line starting with +++ as a header", async () => {
      // Under --unified=0 an added source line whose content begins with "++ "
      // serialises to a line starting with "+++ "; it must not be mistaken for a
      // file header because it is not preceded by a "--- " line.
      const diff = [
        "--- a/src/real.ts",
        "+++ b/src/real.ts",
        "@@ -0,0 +1,2 @@",
        "+++ not-a-header",
        "+normal();",
        "",
      ].join("\n");
      mockExecSuccess(diff);

      const result = await GitUtils.getChangedLinesByFile("base", "head");

      expect(result.get("src/real.ts")).toEqual([1, 2]);
      expect(result.has("not-a-header")).toBe(false);
      expect(result.size).toBe(1);
    });

    it("should ignore hunks that appear before any file header", async () => {
      const diff = ["@@ -1,1 +1,1 @@", "+orphan();", ""].join("\n");
      mockExecSuccess(diff);

      const result = await GitUtils.getChangedLinesByFile("base", "head");

      expect(result.size).toBe(0);
    });

    it("should return an empty map for empty diff output", async () => {
      mockExecSuccess("");

      const result = await GitUtils.getChangedLinesByFile("base", "head");

      expect(result.size).toBe(0);
    });

    it("should throw error when git command fails", async () => {
      mockExecError(new Error("Git command failed"));

      await expect(
        GitUtils.getChangedLinesByFile("base", "head"),
      ).rejects.toThrow("Failed to get changed lines between base and head");

      expect(mockedCore.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to get changed lines"),
      );
    });
  });
});
