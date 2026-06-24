import picomatch from "picomatch";
import { CODE_LANGUAGE_EXTENSIONS } from "./codeExtensions";

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
  // Line numbers on the head side that the changeset added or modified. An
  // empty array means the file changed but added no head-side lines (e.g. a
  // pure deletion), so no uncovered code should be attributed to it. The field
  // is absent only when line-level diff data was not collected at all, in which
  // case consumers fall back to whole-file behaviour.
  changedLines?: number[];
}

export interface Changeset {
  baseCommit: string;
  headCommit: string;
  targetBranch: string;
  files: FileChange[];
  totalFiles: number;
}

export class ChangesetUtils {
  private static readonly DEFAULT_SOURCE_PATTERNS =
    CODE_LANGUAGE_EXTENSIONS.map((ext) => `**/*.${ext}`);

  private static readonly DEFAULT_TEST_PATTERNS = [
    "**/*.test.*",
    "**/*.spec.*",
    "**/test/**",
    "**/tests/**",
    "**/__tests__/**",
    "**/*.mock.*",
  ];

  private static matchesAnyPattern(
    filePath: string,
    patterns: string[],
  ): boolean {
    if (patterns.length === 0) return false;

    return patterns.some((pattern) => {
      const matcher = picomatch(pattern.trim());
      return matcher(filePath);
    });
  }

  static parsePatterns(patternString?: string): string[] {
    if (!patternString) return [];
    return patternString
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  static createChangeset(
    files: string[],
    baseCommit: string,
    headCommit: string = "HEAD",
    targetBranch: string = "main",
    changedLinesByFile?: Map<string, number[]>,
  ): Changeset {
    const fileChanges: FileChange[] = files.map((file) => {
      // When a line map is supplied, every file gets a defined `changedLines`
      // (empty for files that changed without adding head-side lines) so a
      // missing value unambiguously signals the degraded, no-diff-data path.
      if (!changedLinesByFile) {
        return { path: file, status: "modified" as const };
      }
      return {
        path: file,
        status: "modified" as const, // For now, treat all as modified
        changedLines: changedLinesByFile.get(file) ?? [],
      };
    });

    return {
      baseCommit,
      headCommit,
      targetBranch,
      files: fileChanges,
      totalFiles: files.length,
    };
  }

  static filterByPatterns(
    changeset: Changeset,
    sourceCodePattern: string[] = ChangesetUtils.DEFAULT_SOURCE_PATTERNS,
    testCodePattern: string[] = ChangesetUtils.DEFAULT_TEST_PATTERNS,
  ): Changeset {
    const filteredFiles = changeset.files.filter((file) => {
      const matchesSource = ChangesetUtils.matchesAnyPattern(
        file.path,
        sourceCodePattern,
      );
      const matchesTest = ChangesetUtils.matchesAnyPattern(
        file.path,
        testCodePattern,
      );

      return matchesSource && !matchesTest;
    });

    return ChangesetUtils.withFiles(changeset, filteredFiles);
  }

  static filterByExtensions(
    changeset: Changeset,
    extensions: string[],
  ): Changeset {
    const filteredFiles = changeset.files.filter((file) =>
      extensions.some((ext) => file.path.endsWith(ext)),
    );

    return ChangesetUtils.withFiles(changeset, filteredFiles);
  }

  private static withFiles(
    changeset: Changeset,
    files: FileChange[],
  ): Changeset {
    return { ...changeset, files, totalFiles: files.length };
  }

  static isEmpty(changeset: Changeset): boolean {
    return changeset.totalFiles === 0;
  }

  static getSummary(changeset: Changeset): string {
    if (ChangesetUtils.isEmpty(changeset)) {
      return "No files changed";
    }

    const { totalFiles } = changeset;
    const fileWord = totalFiles === 1 ? "file" : "files";

    return `${totalFiles} ${fileWord} changed compared to ${changeset.targetBranch}`;
  }

  static format(changeset: Changeset): string {
    const lines = [
      `Changeset Summary:`,
      `  Base: ${changeset.baseCommit}`,
      `  Head: ${changeset.headCommit}`,
      `  Target Branch: ${changeset.targetBranch}`,
      `  Total Files: ${changeset.totalFiles}`,
      "",
    ];

    if (changeset.files.length > 0) {
      lines.push("Changed Files:");
      changeset.files.forEach((file) => {
        lines.push(`  ${file.status.padEnd(8)} ${file.path}`);
      });
    } else {
      lines.push("No files changed");
    }

    return lines.join("\n");
  }
}
