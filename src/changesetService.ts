import * as core from "@actions/core";
import { GitUtils } from "./git";
import { Changeset, ChangesetUtils } from "./changeset";
import { CODE_LANGUAGE_EXTENSIONS } from "./codeExtensions";

// Default file extensions treated as source code when no glob patterns are
// supplied, derived from the shared language list so it stays in sync with the
// changeset default source patterns.
const DEFAULT_CODE_EXTENSIONS = CODE_LANGUAGE_EXTENSIONS.map(
  (ext) => `.${ext}`,
);

export class ChangesetService {
  static async detectChanges(targetBranch: string): Promise<Changeset> {
    try {
      core.info("🚀 Starting changeset detection");

      const headRef = GitUtils.getPullRequestHead();
      const baseRef = GitUtils.getPullRequestBase();

      core.info(`📌 PR head: ${headRef}`);
      core.info(`🎯 PR base: ${baseRef}`);

      // Compare against the merge base rather than the base branch tip so the
      // changeset only contains the PR's own changes, even when the target
      // branch has advanced since the branch point. When the merge base cannot
      // be resolved (typically a shallow clone) fall back to the PR base SHA to
      // preserve the previous behaviour rather than failing outright.
      const mergeBase = await GitUtils.getMergeBase(baseRef, headRef);
      const diffBase = mergeBase ?? baseRef;

      if (!mergeBase) {
        core.warning(
          "⚠️ Merge base unavailable (likely a shallow clone); falling back to the PR base SHA. " +
            "Increase fetch-depth so the merge base is fetched for accurate changeset detection.",
        );
      }

      const changedFiles = await GitUtils.getChangedFiles(diffBase, headRef);

      const changeset = ChangesetUtils.createChangeset(
        changedFiles,
        diffBase,
        headRef,
        targetBranch,
      );

      core.info("✅ Changeset detection completed");
      core.info(ChangesetUtils.getSummary(changeset));

      return changeset;
    } catch (error) {
      const errorMessage = "Failed to detect changes in pull request";
      core.error(`${errorMessage}: ${error}`);
      throw new Error(errorMessage, { cause: error });
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
    return ChangesetUtils.filterByExtensions(
      changeset,
      extensions || DEFAULT_CODE_EXTENSIONS,
    );
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
