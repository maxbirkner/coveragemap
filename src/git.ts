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

  // Diffing against the merge base (three-dot `base...head`) isolates the PR's
  // own changes even when the target branch advanced since the branch point.
  // Returns null when no common ancestor is found, usually a too-shallow clone.
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

  // `--unified=0` keeps each hunk header to exactly the changed lines (no
  // context), and the `-c` overrides force canonical `a/`/`b/` prefixes
  // regardless of the user's git config so prefix stripping is deterministic.
  static async getChangedLinesByFile(
    base: string,
    head: string = "HEAD",
  ): Promise<Map<string, number[]>> {
    try {
      core.info(`🔎 Getting changed lines between ${base} and ${head}`);

      const { stdout } = await execFileAsync("git", [
        "-c",
        "diff.noprefix=false",
        "-c",
        "diff.mnemonicPrefix=false",
        "diff",
        "--unified=0",
        "--diff-filter=AM",
        `${base}..${head}`,
      ]);

      return GitUtils.parseChangedLines(stdout);
    } catch (error) {
      const errorMessage = `Failed to get changed lines between ${base} and ${head}`;
      core.error(`${errorMessage}: ${error}`);
      throw new Error(errorMessage, { cause: error });
    }
  }

  // Pairing `+++ ` with the preceding `--- ` line avoids mistaking an added
  // content line that merely starts with `+++ ` for a file header.
  private static parseChangedLines(diff: string): Map<string, number[]> {
    const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
    const changedLines = new Map<string, number[]>();
    let currentFile: string | undefined;
    let previousLine = "";

    for (const line of diff.split("\n")) {
      const precedingLine = previousLine;
      previousLine = line;

      if (line.startsWith("+++ ") && precedingLine.startsWith("--- ")) {
        const target = line.slice(4).trim();
        currentFile =
          target === "/dev/null" ? undefined : target.replace(/^b\//, "");
        continue;
      }

      if (!currentFile) continue;

      const match = HUNK_HEADER.exec(line);
      if (!match) continue;

      const start = Number(match[1]);
      // Omitted count means 1; count 0 is a pure deletion with nothing to flag.
      const count = match[2] === undefined ? 1 : Number(match[2]);
      if (count === 0) continue;

      // Hunk start lines are 1-based; a value below 1 would mean malformed diff
      // output, so skip it rather than emit a bogus line number.
      if (start < 1) {
        core.debug(`Skipping hunk with invalid start line ${start}`);
        continue;
      }

      const lines = changedLines.get(currentFile) ?? [];
      for (let offset = 0; offset < count; offset++) {
        lines.push(start + offset);
      }
      changedLines.set(currentFile, lines);
    }

    return changedLines;
  }
}
