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

  describe("getChangedFiles", () => {
    it("should return list of changed files", async () => {
      mockExecSuccess("src/file1.ts\nsrc/file2.js\nREADME.md\n");

      const result = await GitUtils.getChangedFiles("base-sha", "head-sha");

      expect(result).toEqual(["src/file1.ts", "src/file2.js", "README.md"]);
      expect(mockedExec).toHaveBeenCalledWith(
        "git diff --name-only --diff-filter=AM base-sha..head-sha",
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
      expect(mockedExec).toHaveBeenCalledWith(
        "git diff --name-only --diff-filter=AM base-sha..HEAD",
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
});
