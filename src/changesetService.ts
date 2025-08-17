import * as core from "@actions/core";
import { GitUtils } from "./git";
import { Changeset, ChangesetUtils } from "./changeset";

export class ChangesetService {
  static async detectChanges(targetBranch: string): Promise<Changeset> {
    try {
      core.info("🚀 Starting changeset detection");

      const headRef = GitUtils.getPullRequestHead();
      const baseRef = GitUtils.getPullRequestBase();

      core.info(`📌 PR head: ${headRef}`);
      core.info(`🎯 PR base: ${baseRef}`);

      const changedFiles = await GitUtils.getChangedFiles(baseRef, headRef);

      const changeset = ChangesetUtils.createChangeset(
        changedFiles,
        baseRef,
        headRef,
        targetBranch,
      );

      core.info("✅ Changeset detection completed");
      core.info(ChangesetUtils.getSummary(changeset));

      return changeset;
    } catch (error) {
      const errorMessage = "Failed to detect changes in pull request";
      core.error(`${errorMessage}: ${error}`);
      throw new Error(errorMessage);
    }
  }

  static async detectCodeChanges(
    targetBranch: string,
    extensions?: string[],
    sourceCodePattern?: string,
    testCodePattern?: string,
  ): Promise<Changeset> {
    const changeset = await ChangesetService.detectChanges(targetBranch);

    // If patterns are provided, use pattern-based filtering
    if (sourceCodePattern || testCodePattern) {
      return ChangesetUtils.filterByPatterns(
        changeset,
        ChangesetUtils.parsePatterns(sourceCodePattern),
        ChangesetUtils.parsePatterns(testCodePattern),
      );
    }

    // Fall back to extension-based filtering
    const defaultExtensions = extensions || [
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
    ];

    return ChangesetUtils.filterByExtensions(changeset, defaultExtensions);
  }

  static outputChangeset(changeset: Changeset): void {
    core.info("📤 Setting GitHub Actions outputs");

    core.setOutput("changed-files-count", changeset.totalFiles);
    core.setOutput(
      "changed-files",
      changeset.files.map((f) => f.path).join(","),
    );
    core.setOutput("base-commit", changeset.baseCommit);
    core.setOutput("head-commit", changeset.headCommit);
    core.setOutput("target-branch", changeset.targetBranch);

    const formattedChangeset = ChangesetUtils.format(changeset);
    core.info("📋 Changeset Details:");
    formattedChangeset.split("\n").forEach((line) => core.info(line));
  }
}
