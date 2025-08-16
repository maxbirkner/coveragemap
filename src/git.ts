import { exec } from "child_process";
import { promisify } from "util";
import * as core from "@actions/core";

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

  static async findMergeBase(base: string, head: string): Promise<string> {
    try {
      core.info(`🔍 Finding merge base between ${base} and ${head}`);
      const { stdout } = await execAsync(`git merge-base ${base} ${head}`);
      const mergeBase = stdout.trim();
      core.info(`📍 Merge base found: ${mergeBase}`);
      return mergeBase;
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
        `git diff --name-only --diff-filter=AM ${base}...${head}`,
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

      try {
        await execAsync(`git rev-parse --verify ${base}`);
        core.info(`✅ Reference ${base} already exists locally`);
        return;
      } catch {}

      const parts = base.split("/");
      if (parts.length >= 2) {
        const remote = parts[0];
        const branch = parts.slice(1).join("/");

        core.info(`📥 Fetching ${branch} from ${remote}`);
        await execAsync(
          `git fetch ${remote} ${branch}:${base.replace("/", "-local-")}`,
        );
        core.info(`✅ Successfully fetched ${base}`);
      } else {
        core.warning(
          `⚠️ Could not parse remote/branch from ${base}, assuming it's already available`,
        );
      }
    } catch (error) {
      core.warning(`⚠️ Failed to fetch base reference ${base}: ${error}`);
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
