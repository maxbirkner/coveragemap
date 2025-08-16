import { exec } from "child_process";
import { promisify } from "util";
import * as core from "@actions/core";
import { context } from "@actions/github";

const execAsync = promisify(exec);

export class GitUtils {
  static getPullRequestHead(): string {
    // Use GitHub context which is most reliable for PR events
    if (context.payload.pull_request?.head?.sha) {
      const contextSha = context.payload.pull_request.head.sha;
      core.info(`📌 Using PR head from GitHub context: ${contextSha}`);
      return contextSha;
    }

    throw new Error("PR head SHA not available in GitHub context");
  }

  static getPullRequestBase(): string {
    // Use GitHub context which is most reliable for PR events
    if (context.payload.pull_request?.base?.sha) {
      const contextSha = context.payload.pull_request.base.sha;
      core.info(`🎯 Using PR base from GitHub context: ${contextSha}`);
      return contextSha;
    }

    throw new Error("PR base SHA not available in GitHub context");
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
}
