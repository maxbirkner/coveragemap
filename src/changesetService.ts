import * as core from "@actions/core";
import { context } from "@actions/github";
import { GitUtils } from "./git";
import { Changeset, ChangesetUtils } from "./changeset";

export class ChangesetService {
  static async detectChanges(targetBranch: string): Promise<Changeset> {
    try {
      core.info("🚀 Starting changeset detection");
      core.info(`🎯 Target branch: ${targetBranch}`);

      const prHead = await GitUtils.getPullRequestHead();
      const headRef = prHead || "HEAD";
      core.info(`📦 PR head commit: ${headRef}`);

      // Use GitHub context base SHA if available, otherwise fallback to target branch reference
      let baseRef: string;
      let needsMergeBase = false;

      if (context.payload.pull_request?.base?.sha) {
        baseRef = context.payload.pull_request.base.sha;
        core.info(`📌 Using PR base from GitHub context: ${baseRef}`);
        needsMergeBase = false; // We already have the exact base commit
      } else {
        baseRef = `origin/${targetBranch}`;
        core.info(`📍 Falling back to target branch reference: ${baseRef}`);
        await GitUtils.ensureBaseRef(baseRef);
        needsMergeBase = true; // We need to find the merge base for branch references
      }

      // Only find merge base if we're using branch references, not commit SHAs
      const compareBase = needsMergeBase
        ? await GitUtils.findMergeBase(baseRef, headRef)
        : baseRef;

      const changedFiles = await GitUtils.getChangedFiles(compareBase, headRef);

      const changeset = ChangesetUtils.createChangeset(
        changedFiles,
        compareBase,
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
