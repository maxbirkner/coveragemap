import { exec } from "child_process";
import { promisify } from "util";
import * as core from "@actions/core";
import { context } from "@actions/github";

const execAsync = promisify(exec);

export class GitUtils {
  static async getCurrentCommit(): Promise<string> {
    try {
      const { stdout } = await execAsync("git rev-parse HEAD");
      return stdout.trim();
    } catch (error) {
      core.error(`Failed to get current commit: ${error}`);
      throw new Error("Failed to get current commit");
    }
  }

  static async getPullRequestHead(): Promise<string | null> {
    try {
      // First priority: GitHub context which is most reliable for PR events
      if (context.payload.pull_request?.head?.sha) {
        const contextSha = context.payload.pull_request.head.sha;
        core.info(`📌 Using PR head from GitHub context: ${contextSha}`);
        return contextSha;
      }

      // Check if we're dealing with a merge commit first
      const currentCommit = await GitUtils.getCurrentCommit();
      const { stdout: parents } = await execAsync(
        `git rev-list --parents -n 1 ${currentCommit}`,
      );
      const parentCommits = parents.trim().split(" ").slice(1); // Remove the commit itself, keep parents

      if (parentCommits.length === 2) {
        core.info(
          `🔀 Detected merge commit with parents: ${parentCommits.join(", ")}`,
        );

        // Try to get the actual PR head from GitHub event if available
        const prHeadFromEvent =
          process.env.GITHUB_HEAD_SHA || process.env.GITHUB_EVENT_HEAD_SHA;
        if (prHeadFromEvent) {
          core.info(`📌 Using PR head from GitHub event: ${prHeadFromEvent}`);
          return prHeadFromEvent;
        }

        // Fallback: In a GitHub Actions merge scenario, the second parent is usually the PR head
        const prHeadCandidate = parentCommits[1];
        core.info(`📍 Using PR head commit: ${prHeadCandidate}`);
        return prHeadCandidate;
      }

      // If not a merge commit, check GITHUB_SHA
      const prHead = process.env.GITHUB_SHA;
      if (prHead) {
        core.info(`📌 Using GITHUB_SHA: ${prHead}`);
        return prHead;
      }

      // Fallback: current HEAD is the PR head
      core.info(`📍 Using current HEAD as PR head: ${currentCommit}`);
      return currentCommit;
    } catch (error) {
      core.warning(
        `⚠️ Failed to determine PR head, falling back to HEAD: ${error}`,
      );
      return null;
    }
  }

  static async findMergeBase(base: string, head: string): Promise<string> {
    try {
      core.info(`🔍 Finding merge base between ${base} and ${head}`);

      // Try the base reference as provided first
      try {
        const { stdout } = await execAsync(`git merge-base ${base} ${head}`);
        const mergeBase = stdout.trim();
        core.info(`📍 Merge base found: ${mergeBase}`);
        return mergeBase;
      } catch (error) {
        core.warning(
          `⚠️ Failed to find merge base with ${base}, trying alternatives: ${error}`,
        );
      }

      // If base is origin/main, try alternatives common in CI environments
      if (base === "origin/main") {
        const alternatives = [
          "main",
          "refs/remotes/origin/main",
          "remotes/origin/main",
        ];

        for (const alternative of alternatives) {
          try {
            core.info(`🔄 Trying alternative base reference: ${alternative}`);
            const { stdout } = await execAsync(
              `git merge-base ${alternative} ${head}`,
            );
            const mergeBase = stdout.trim();
            core.info(`📍 Merge base found with ${alternative}: ${mergeBase}`);
            return mergeBase;
          } catch (alternativeError) {
            core.debug(`Failed with ${alternative}: ${alternativeError}`);
          }
        }
      }

      // Final fallback: if head is a commit SHA, try to find common ancestor with current HEAD
      try {
        core.info(`🔄 Trying fallback: finding merge base with HEAD`);
        const { stdout } = await execAsync(`git merge-base HEAD ${head}`);
        const mergeBase = stdout.trim();
        core.info(`📍 Fallback merge base found: ${mergeBase}`);
        return mergeBase;
      } catch (fallbackError) {
        core.debug(`Fallback also failed: ${fallbackError}`);
      }

      throw new Error(
        `Unable to find merge base between ${base} and ${head} using any method`,
      );
    } catch (error) {
      const errorMessage = `Failed to find merge base between ${base} and ${head}`;
      core.error(`${errorMessage}: ${error}`);
      throw new Error(errorMessage);
    }
  }

  static async getChangedFiles(
    base: string,
    head: string = "HEAD",
  ): Promise<string[]> {
    try {
      core.info(`📂 Getting changed files between ${base} and ${head}`);

      const { stdout } = await execAsync(
        `git diff --name-only --diff-filter=AM ${base}..${head}`,
      );

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
      throw new Error(errorMessage);
    }
  }

  static async ensureBaseRef(base: string): Promise<void> {
    try {
      core.info(`🔄 Ensuring base reference ${base} is available`);

      // First, try to verify if the reference already exists
      try {
        await execAsync(`git rev-parse --verify ${base}`);
        core.info(`✅ Reference ${base} already exists locally`);
        return;
      } catch {}

      // Try alternative reference formats that might exist in CI
      if (base === "origin/main") {
        const alternatives = [
          "main",
          "refs/remotes/origin/main",
          "remotes/origin/main",
        ];

        for (const alternative of alternatives) {
          try {
            await execAsync(`git rev-parse --verify ${alternative}`);
            core.info(`✅ Found alternative reference: ${alternative}`);
            return;
          } catch {}
        }
      }

      // If not found, try to fetch it
      const parts = base.split("/");
      if (parts.length >= 2) {
        const remote = parts[0];
        const branch = parts.slice(1).join("/");

        try {
          core.info(`📥 Fetching ${branch} from ${remote}`);
          await execAsync(`git fetch ${remote} ${branch}`);
          core.info(`✅ Successfully fetched ${branch} from ${remote}`);
        } catch (fetchError) {
          core.warning(
            `⚠️ Failed to fetch ${branch} from ${remote}: ${fetchError}`,
          );

          // Try a more general fetch
          try {
            core.info(`📥 Trying general fetch from ${remote}`);
            await execAsync(`git fetch ${remote}`);
            core.info(`✅ Successfully fetched from ${remote}`);
          } catch (generalFetchError) {
            core.warning(`⚠️ General fetch also failed: ${generalFetchError}`);
          }
        }
      } else {
        core.warning(
          `⚠️ Could not parse remote/branch from ${base}, assuming it's already available`,
        );
      }
    } catch (error) {
      core.warning(`⚠️ Failed to ensure base reference ${base}: ${error}`);
    }
  }

  static async getCurrentBranch(): Promise<string> {
    try {
      const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD");
      return stdout.trim();
    } catch (error) {
      core.error(`Failed to get current branch: ${error}`);
      throw new Error("Failed to get current branch");
    }
  }
}
