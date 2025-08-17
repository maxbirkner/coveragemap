import picomatch from "picomatch";

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
}

export interface Changeset {
  baseCommit: string;
  headCommit: string;
  targetBranch: string;
  files: FileChange[];
  totalFiles: number;
}

export class ChangesetUtils {
  private static matchesAnyPattern(filePath: string, patterns: string[]): boolean {
    if (patterns.length === 0) return false;

    return patterns.some(pattern => {
      const matcher = picomatch(pattern.trim());
      return matcher(filePath);
    });
  }

  private static parsePatterns(patternString?: string): string[] {
    if (!patternString) return [];
    return patternString.split(',').map(p => p.trim()).filter(p => p.length > 0);
  }

  static createChangeset(
    files: string[],
    baseCommit: string,
    headCommit: string = "HEAD",
    targetBranch: string = "main",
  ): Changeset {
    const fileChanges: FileChange[] = files.map((file) => ({
      path: file,
      status: "modified" as const, // For now, treat all as modified
    }));

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
    sourceCodePattern?: string,
    testCodePattern?: string,
  ): Changeset {
    const sourcePatterns = ChangesetUtils.parsePatterns(sourceCodePattern);
    const testPatterns = ChangesetUtils.parsePatterns(testCodePattern);

    // Default patterns if none provided
    const defaultSourcePatterns = [
      "**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx",
      "**/*.py", "**/*.java", "**/*.cs", "**/*.cpp",
      "**/*.c", "**/*.go", "**/*.rs"
    ];
    const defaultTestPatterns = [
      "**/*.test.*", "**/*.spec.*", "**/test/**",
      "**/tests/**", "**/__tests__/**", "**/*.mock.*"
    ];

    const effectiveSourcePatterns = sourcePatterns.length > 0 ? sourcePatterns : defaultSourcePatterns;
    const effectiveTestPatterns = testPatterns.length > 0 ? testPatterns : defaultTestPatterns;

    const filteredFiles = changeset.files.filter((file) => {
      const matchesSource = ChangesetUtils.matchesAnyPattern(file.path, effectiveSourcePatterns);
      const matchesTest = ChangesetUtils.matchesAnyPattern(file.path, effectiveTestPatterns);

      return matchesSource && !matchesTest;
    });

    return {
      ...changeset,
      files: filteredFiles,
      totalFiles: filteredFiles.length,
    };
  }

  static filterByExtensions(
    changeset: Changeset,
    extensions: string[],
  ): Changeset {
    const filteredFiles = changeset.files.filter((file) =>
      extensions.some((ext) => file.path.endsWith(ext)),
    );

    return {
      ...changeset,
      files: filteredFiles,
      totalFiles: filteredFiles.length,
    };
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
