import * as core from "@actions/core";
import { GitUtils } from "./git";
import { Changeset, ChangesetUtils } from "./changeset";

export class ChangesetService {
  static async detectChanges(targetBranch: string): Promise<Changeset> {
    try {
      core.info("🚀 Starting changeset detection");
      core.info(`🎯 Target branch: ${targetBranch}`);
      core.info(`📦 Current commit: ${await GitUtils.getCurrentCommit()}`);

      const baseRef = `origin/${targetBranch}`;
      await GitUtils.ensureBaseRef(baseRef);

      const mergeBase = await GitUtils.findMergeBase(baseRef, "HEAD");

      const changedFiles = await GitUtils.getChangedFiles(mergeBase, "HEAD");

      const changeset = ChangesetUtils.createChangeset(
        changedFiles,
        mergeBase,
        "HEAD",
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
    extensions: string[] = [
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
  ): Promise<Changeset> {
    const changeset = await ChangesetService.detectChanges(targetBranch);
    return ChangesetUtils.filterByExtensions(changeset, extensions);
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
