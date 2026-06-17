import { exec } from "child_process";
import { promisify } from "util";
import * as core from "@actions/core";
import { context } from "@actions/github";

const execAsync = promisify(exec);

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
      throw new Error(errorMessage, { cause: error });
    }
  }
}
