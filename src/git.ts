import { execFile, spawn } from "child_process";
import { createInterface } from "readline";
import { promisify } from "util";
import * as core from "@actions/core";
import { context } from "@actions/github";
import { toErrorMessage } from "./errors";

// `execFile` runs git directly without a shell, so refs are passed as an argv
// array and never interpreted by a shell. This avoids command injection even if
// a ref ever contained shell metacharacters.
const execFileAsync = promisify(execFile);
const MAX_STDERR_LENGTH = 64 * 1024;

interface DiffParserState {
  readonly changedLines: Map<string, number[]>;
  currentFile?: string;
  previousLine: string;
}

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

      const child = spawn(
        "git",
        [
          "-c",
          "diff.noprefix=false",
          "-c",
          "diff.mnemonicPrefix=false",
          "diff",
          "--unified=0",
          "--diff-filter=AM",
          `${base}..${head}`,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-MAX_STDERR_LENGTH);
      });

      const completion = new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(
            new Error(stderr.trim() || `git diff exited with code ${code}`),
          );
        });
      });

      const state: DiffParserState = {
        changedLines: new Map(),
        previousLine: "",
      };
      const lines = createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });
      const parseOutput = async (): Promise<void> => {
        for await (const line of lines) {
          GitUtils.parseChangedLine(line, state);
        }
      };

      await Promise.all([completion, parseOutput()]);
      return state.changedLines;
    } catch (error) {
      const errorMessage = `Failed to get changed lines between ${base} and ${head}`;
      core.error(`${errorMessage}: ${error}`);
      throw new Error(errorMessage, { cause: error });
    }
  }

  // Pairing `+++ ` with the preceding `--- ` line avoids mistaking an added
  // content line that merely starts with `+++ ` for a file header.
  private static parseChangedLine(line: string, state: DiffParserState): void {
    const precedingLine = state.previousLine;
    state.previousLine = line;

    if (line.startsWith("+++ ") && precedingLine.startsWith("--- ")) {
      const target = line.slice(4).trim();
      state.currentFile =
        target === "/dev/null" ? undefined : target.replace(/^b\//, "");
      return;
    }

    if (!state.currentFile) return;

    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) return;

    const start = Number(match[1]);
    // Omitted count means 1; count 0 is a pure deletion with nothing to flag.
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count === 0) return;

    // Hunk start lines are 1-based; a value below 1 would mean malformed diff
    // output, so skip it rather than emit a bogus line number.
    if (start < 1) {
      core.debug(`Skipping hunk with invalid start line ${start}`);
      return;
    }

    const lines = state.changedLines.get(state.currentFile) ?? [];
    for (let offset = 0; offset < count; offset++) {
      lines.push(start + offset);
    }
    state.changedLines.set(state.currentFile, lines);
  }
}
