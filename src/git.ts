import { execFile } from "child_process";
import { promisify } from "util";
import * as core from "@actions/core";
import { context } from "@actions/github";
import { toErrorMessage } from "./errors";

// `execFile` runs git directly without a shell, so refs are passed as an argv
// array and never interpreted by a shell. This avoids command injection even if
// a ref ever contained shell metacharacters.
const execFileAsync = promisify(execFile);

export class GitUtils {
  // The GitHub context is populated from the event payload, which is the most
  // reliable source of PR SHAs during pull_request events.
  private static getPullRequestSha(
    ref: "head" | "base",
    emoji: string,
  ): string {
    const sha = context.payload.pull_request?.[ref]?.sha;
    if (sha) {
      core.info(`${emoji} Using PR ${ref} from GitHub context: ${sha}`);
      return sha;
    }

    throw new Error(`PR ${ref} SHA not available in GitHub context`);
  }

  static getPullRequestHead(): string {
    return GitUtils.getPullRequestSha("head", "📌");
  }

  static getPullRequestBase(): string {
    return GitUtils.getPullRequestSha("base", "🎯");
  }

  // Resolves the merge base (the most recent common ancestor) between the PR
  // base and head. Diffing against the merge base — equivalent to git's
  // three-dot `base...head` — isolates the changes the PR actually introduced,
  // even when the target branch has advanced since the branch point. A plain
  // two-dot `base..head` diff would otherwise attribute unrelated target-branch
  // commits to the PR. Returns `null` when no common ancestor can be found,
  // which typically means the clone is too shallow to contain it.
  static async getMergeBase(
    base: string,
    head: string,
  ): Promise<string | null> {
    try {
      core.info(`🔱 Resolving merge base between ${base} and ${head}`);

      // `--` terminates option parsing so refs are always treated as revisions.
      const { stdout } = await execFileAsync("git", [
        "merge-base",
        "--",
        base,
        head,
      ]);
      const mergeBase = stdout.trim();

      if (!mergeBase) {
        return null;
      }

      core.info(`🌳 Merge base: ${mergeBase}`);
      return mergeBase;
    } catch (error) {
      // The caller (ChangesetService) surfaces the actionable warning with
      // fetch-depth guidance, so keep this at debug level to avoid duplicate
      // warnings for the same condition (e.g. shallow clones).
      core.debug(
        `Could not determine merge base between ${base} and ${head}: ${toErrorMessage(
          error,
        )}`,
      );
      return null;
    }
  }

  static async getChangedFiles(
    base: string,
    head: string = "HEAD",
  ): Promise<string[]> {
    try {
      core.info(`📂 Getting changed files between ${base} and ${head}`);

      const { stdout } = await execFileAsync("git", [
        "diff",
        "--name-only",
        "--diff-filter=AM",
        `${base}..${head}`,
      ]);

      const files = stdout
        .split("\n")
        .map((file) => file.trim())
        .filter((file) => file.length > 0);

      core.info(`📊 Found ${files.length} changed files`);
      files.forEach((file) => core.info(`  - ${file}`));

      return files;
    } catch (error) {
      const errorMessage = `Failed to get changed files between ${base} and ${head}`;
      core.error(`${errorMessage}: ${error}`);
      throw new Error(errorMessage, { cause: error });
    }
  }
}
