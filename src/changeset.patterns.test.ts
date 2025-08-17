import { ChangesetUtils, Changeset } from "./changeset";

describe("ChangesetUtils - Pattern Filtering", () => {
  const sampleChangeset: Changeset = {
    baseCommit: "base-sha",
    headCommit: "head-sha",
    targetBranch: "main",
    files: [
      { path: "src/main.ts", status: "modified" },
      { path: "src/utils.js", status: "modified" },
      { path: "src/components/Button.tsx", status: "added" },
      { path: "lib/helper.py", status: "modified" },
      { path: "src/main.test.ts", status: "modified" },
      { path: "src/utils.spec.js", status: "modified" },
      { path: "tests/integration.test.js", status: "added" },
      { path: "docs/readme.md", status: "modified" },
      { path: "config.json", status: "modified" },
      { path: "__tests__/unit.test.ts", status: "modified" },
      { path: "src/components/Button.mock.ts", status: "added" },
    ],
    totalFiles: 11,
  };

  describe("filterByPatterns", () => {
    it("should filter using default patterns when none provided", () => {
      const result = ChangesetUtils.filterByPatterns(sampleChangeset);

      expect(result.files).toHaveLength(4);
      expect(result.files.map(f => f.path)).toEqual([
        "src/main.ts",
        "src/utils.js", 
        "src/components/Button.tsx",
        "lib/helper.py"
      ]);
      expect(result.totalFiles).toBe(4);
    });

    it("should filter using custom source code patterns", () => {
      const result = ChangesetUtils.filterByPatterns(
        sampleChangeset,
        "src/**/*.ts,src/**/*.tsx"
      );

      expect(result.files).toHaveLength(2);
      expect(result.files.map(f => f.path)).toEqual([
        "src/main.ts",
        "src/components/Button.tsx"
      ]);
    });

    it("should exclude files matching test patterns", () => {
      const result = ChangesetUtils.filterByPatterns(
        sampleChangeset,
        "**/*.ts,**/*.js,**/*.tsx",
        "**/*.test.*,**/*.spec.*"
      );

      expect(result.files).toHaveLength(4);
      expect(result.files.map(f => f.path)).toEqual([
        "src/main.ts",
        "src/utils.js",
        "src/components/Button.tsx",
        "src/components/Button.mock.ts" // .mock.ts is NOT excluded by the custom test patterns
      ]);
    });

    it("should handle custom test patterns", () => {
      const result = ChangesetUtils.filterByPatterns(
        sampleChangeset,
        "**/*.ts,**/*.js,**/*.tsx",
        "**/*.mock.*,**/tests/**"
      );

      expect(result.files).toHaveLength(6);
      expect(result.files.map(f => f.path)).toEqual([
        "src/main.ts",
        "src/utils.js",
        "src/components/Button.tsx",
        "src/main.test.ts",  // .test.ts is NOT excluded by custom pattern
        "src/utils.spec.js", // .spec.js is NOT excluded by custom pattern
        "__tests__/unit.test.ts" // __tests__ is NOT excluded by custom pattern (only tests/ is)
      ]);
    });

    it("should handle multiple comma-separated patterns", () => {
      const result = ChangesetUtils.filterByPatterns(
        sampleChangeset,
        "src/**/*.ts, lib/**/*.py, src/**/*.tsx",  // with spaces
        "**/*.test.*, **/*.spec.*, **/*.mock.*"
      );

      expect(result.files).toHaveLength(3);
      expect(result.files.map(f => f.path)).toEqual([
        "src/main.ts",
        "src/components/Button.tsx",
        "lib/helper.py"
      ]);
    });

    it("should return empty changeset when no files match source patterns", () => {
      const result = ChangesetUtils.filterByPatterns(
        sampleChangeset,
        "nonexistent/**/*.xyz"
      );

      expect(result.files).toHaveLength(0);
      expect(result.totalFiles).toBe(0);
    });

    it("should preserve changeset metadata", () => {
      const result = ChangesetUtils.filterByPatterns(sampleChangeset, "**/*.ts");

      expect(result.baseCommit).toBe("base-sha");
      expect(result.headCommit).toBe("head-sha");
      expect(result.targetBranch).toBe("main");
    });

    it("should handle empty patterns gracefully", () => {
      const result = ChangesetUtils.filterByPatterns(sampleChangeset, "", "");

      // Should use default patterns
      expect(result.files).toHaveLength(4);
      expect(result.files.map(f => f.path)).toEqual([
        "src/main.ts",
        "src/utils.js",
        "src/components/Button.tsx", 
        "lib/helper.py"
      ]);
    });

    it("should handle whitespace-only patterns", () => {
      const result = ChangesetUtils.filterByPatterns(sampleChangeset, "   ", "   ");

      // Should use default patterns
      expect(result.files).toHaveLength(4);
    });
  });

  describe("Pattern matching edge cases", () => {
    const edgeCaseChangeset: Changeset = {
      baseCommit: "base",
      headCommit: "head", 
      targetBranch: "main",
      files: [
        { path: "src/file.test.backup.ts", status: "modified" },
        { path: "test.file.js", status: "modified" },
        { path: "src/deeply/nested/path/file.ts", status: "modified" },
        { path: "file-with-dashes.js", status: "modified" },
        { path: "src/file_with_underscores.py", status: "modified" },
        { path: "src/file.with.dots.js", status: "modified" },
      ],
      totalFiles: 6,
    };

    it("should handle complex file names and paths", () => {
      const result = ChangesetUtils.filterByPatterns(
        edgeCaseChangeset,
        "**/*.ts,**/*.js,**/*.py",
        "**/*.test.*"
      );

      // Should exclude file.test.backup.ts but include others
      expect(result.files).toHaveLength(5);
      expect(result.files.find(f => f.path.includes("test.backup"))).toBeUndefined();
    });

    it("should match deeply nested paths with **", () => {
      const result = ChangesetUtils.filterByPatterns(
        edgeCaseChangeset,
        "src/**/*.ts"
      );

      expect(result.files).toHaveLength(1);
      expect(result.files.map(f => f.path)).toEqual([
        "src/deeply/nested/path/file.ts" // file.test.backup.ts is excluded by default test patterns
      ]);
    });

    it("should handle special characters in filenames", () => {
      const result = ChangesetUtils.filterByPatterns(
        edgeCaseChangeset,
        "**/file-with-dashes.*,**/file_with_underscores.*,**/file.with.dots.*"
      );

      expect(result.files).toHaveLength(3);
      expect(result.files.map(f => f.path)).toEqual([
        "file-with-dashes.js",
        "src/file_with_underscores.py",
        "src/file.with.dots.js"
      ]);
    });
  });
});
