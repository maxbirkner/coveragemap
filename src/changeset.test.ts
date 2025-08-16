import { FileChange, Changeset, ChangesetUtils } from "./changeset";

describe("ChangesetUtils", () => {
  describe("createChangeset", () => {
    it("should create a changeset with the provided parameters", () => {
      const files = ["src/file1.ts", "src/file2.js"];
      const baseCommit = "abc123";
      const headCommit = "def456";
      const targetBranch = "main";

      const changeset = ChangesetUtils.createChangeset(
        files,
        baseCommit,
        headCommit,
        targetBranch,
      );

      expect(changeset).toEqual({
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [
          { path: "src/file1.ts", status: "modified" },
          { path: "src/file2.js", status: "modified" },
        ],
        totalFiles: 2,
      });
    });

    it("should use default values for optional parameters", () => {
      const files = ["src/file1.ts"];
      const baseCommit = "abc123";

      const changeset = ChangesetUtils.createChangeset(files, baseCommit);

      expect(changeset).toEqual({
        baseCommit: "abc123",
        headCommit: "HEAD",
        targetBranch: "main",
        files: [{ path: "src/file1.ts", status: "modified" }],
        totalFiles: 1,
      });
    });

    it("should handle empty file list", () => {
      const files: string[] = [];
      const baseCommit = "abc123";

      const changeset = ChangesetUtils.createChangeset(files, baseCommit);

      expect(changeset).toEqual({
        baseCommit: "abc123",
        headCommit: "HEAD",
        targetBranch: "main",
        files: [],
        totalFiles: 0,
      });
    });
  });

  describe("filterByExtensions", () => {
    let changeset: Changeset;

    beforeEach(() => {
      changeset = {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [
          { path: "src/component.ts", status: "modified" },
          { path: "src/utils.js", status: "modified" },
          { path: "README.md", status: "modified" },
          { path: "package.json", status: "modified" },
          { path: "test/component.test.ts", status: "modified" },
        ],
        totalFiles: 5,
      };
    });

    it("should filter files by specified extensions", () => {
      const filtered = ChangesetUtils.filterByExtensions(changeset, [
        ".ts",
        ".js",
      ]);

      expect(filtered.files).toEqual([
        { path: "src/component.ts", status: "modified" },
        { path: "src/utils.js", status: "modified" },
        { path: "test/component.test.ts", status: "modified" },
      ]);
      expect(filtered.totalFiles).toBe(3);
    });

    it("should return empty changeset if no files match extensions", () => {
      const filtered = ChangesetUtils.filterByExtensions(changeset, [
        ".py",
        ".java",
      ]);

      expect(filtered.files).toEqual([]);
      expect(filtered.totalFiles).toBe(0);
    });

    it("should preserve all metadata except files", () => {
      const filtered = ChangesetUtils.filterByExtensions(changeset, [".ts"]);

      expect(filtered.baseCommit).toBe(changeset.baseCommit);
      expect(filtered.headCommit).toBe(changeset.headCommit);
      expect(filtered.targetBranch).toBe(changeset.targetBranch);
    });

    it("should handle empty extensions array", () => {
      const filtered = ChangesetUtils.filterByExtensions(changeset, []);

      expect(filtered.files).toEqual([]);
      expect(filtered.totalFiles).toBe(0);
    });
  });

  describe("isEmpty", () => {
    it("should return true for changeset with no files", () => {
      const changeset: Changeset = {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [],
        totalFiles: 0,
      };

      expect(ChangesetUtils.isEmpty(changeset)).toBe(true);
    });

    it("should return false for changeset with files", () => {
      const changeset: Changeset = {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [{ path: "src/file.ts", status: "modified" }],
        totalFiles: 1,
      };

      expect(ChangesetUtils.isEmpty(changeset)).toBe(false);
    });
  });

  describe("getSummary", () => {
    it("should return 'No files changed' for empty changeset", () => {
      const changeset: Changeset = {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [],
        totalFiles: 0,
      };

      expect(ChangesetUtils.getSummary(changeset)).toBe("No files changed");
    });

    it("should return singular form for one file", () => {
      const changeset: Changeset = {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [{ path: "src/file.ts", status: "modified" }],
        totalFiles: 1,
      };

      expect(ChangesetUtils.getSummary(changeset)).toBe(
        "1 file changed compared to main",
      );
    });

    it("should return plural form for multiple files", () => {
      const changeset: Changeset = {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "develop",
        files: [
          { path: "src/file1.ts", status: "modified" },
          { path: "src/file2.ts", status: "modified" },
        ],
        totalFiles: 2,
      };

      expect(ChangesetUtils.getSummary(changeset)).toBe(
        "2 files changed compared to develop",
      );
    });
  });

  describe("format", () => {
    it("should format changeset with files", () => {
      const changeset: Changeset = {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [
          { path: "src/file1.ts", status: "modified" },
          { path: "src/file2.js", status: "added" },
        ],
        totalFiles: 2,
      };

      const formatted = ChangesetUtils.format(changeset);

      expect(formatted).toContain("Changeset Summary:");
      expect(formatted).toContain("Base: abc123");
      expect(formatted).toContain("Head: def456");
      expect(formatted).toContain("Target Branch: main");
      expect(formatted).toContain("Total Files: 2");
      expect(formatted).toContain("Changed Files:");
      expect(formatted).toContain("modified src/file1.ts");
      expect(formatted).toContain("added    src/file2.js");
    });

    it("should format empty changeset", () => {
      const changeset: Changeset = {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [],
        totalFiles: 0,
      };

      const formatted = ChangesetUtils.format(changeset);

      expect(formatted).toContain("Changeset Summary:");
      expect(formatted).toContain("Total Files: 0");
      expect(formatted).toContain("No files changed");
      expect(formatted).not.toContain("Changed Files:");
    });
  });
});
