import * as core from "@actions/core";
import * as github from "@actions/github";
import { createAppAuth } from "@octokit/auth-app";
import { CoverageAnalysis, FileChangeWithCoverage } from "./coverageAnalyzer";
import { GatingResult } from "./coverageGating";
import { FunctionCoverage } from "./lcov";

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "notice" | "warning" | "failure";
  message: string;
  title?: string;
  raw_details?: string;
}

export interface ChecksServiceConfig {
  githubAppId: string;
  githubAppPrivateKey: string;
  githubToken: string;
  coverageThreshold: number;
  label?: string;
}

export class ChecksService {
  private config: ChecksServiceConfig;
  private maxAnnotations = 50;

  // Demangled C++ template signatures can run to hundreds of characters, which
  // renders check annotations unreadable. Truncate names past this length so a
  // single annotation never spans multiple screens.
  private static readonly maxFunctionNameLength = 80;

  constructor(config: ChecksServiceConfig) {
    this.config = config;
  }

  private getCheckName(): string {
    return this.config.label
      ? `Coverage Treemap Action: ${this.config.label}`
      : "Coverage Treemap Action";
  }

  private getServerUrl(): string {
    return (
      github.context.serverUrl ||
      process.env.GITHUB_SERVER_URL ||
      "https://github.com"
    );
  }

  static isEnabled(
    githubAppId?: string,
    githubAppPrivateKey?: string,
  ): boolean {
    return !!(githubAppId && githubAppPrivateKey);
  }

  generateAnnotations(analysis: CoverageAnalysis): CheckAnnotation[] {
    const annotations: CheckAnnotation[] = [];

    for (const file of analysis.changedFiles) {
      if (!file.coverage) {
        annotations.push({
          path: file.path,
          start_line: 1,
          end_line: 1,
          annotation_level: "warning",
          title: "No Coverage Data",
          message:
            "This file has no coverage data. Consider adding tests or ensuring the file is included in coverage instrumentation.",
        });
        continue;
      }

      const uncoveredLineAnnotations =
        this.generateUncoveredLineAnnotations(file);
      annotations.push(...uncoveredLineAnnotations);

      const uncoveredFunctionAnnotations =
        this.generateUncoveredFunctionAnnotations(file);
      annotations.push(...uncoveredFunctionAnnotations);

      // Only complement changeset-touched uncovered code: skip the notice when
      // no uncovered lines or functions were introduced.
      const touchedUncoveredCode =
        uncoveredLineAnnotations.length > 0 ||
        uncoveredFunctionAnnotations.length > 0;

      if (
        touchedUncoveredCode &&
        file.analysis.overallCoveragePercentage < 80
      ) {
        annotations.push({
          path: file.path,
          start_line: 1,
          end_line: 1,
          annotation_level: "notice",
          title: "Low Coverage",
          message: `File coverage is ${file.analysis.overallCoveragePercentage}%. Consider adding more tests to improve coverage.`,
          raw_details: this.formatFileCoverageSummary(file),
        });
      }
    }

    return this.prioritizeAndLimitAnnotations(annotations);
  }

  private generateUncoveredLineAnnotations(
    file: FileChangeWithCoverage,
  ): CheckAnnotation[] {
    if (!file.coverage) return [];

    const isInChangeset = this.changedLinePredicate(file);

    // Templated code is instrumented once per instantiation, so a source line
    // can appear in several DA records with differing hit counts. Collapse them
    // to the highest hit count: the line is covered if any instantiation hit
    // it, avoiding spurious "uncovered" annotations on covered template code.
    const maxHitByLine = new Map<number, number>();
    for (const line of file.coverage.lines) {
      const previous = maxHitByLine.get(line.line) ?? 0;
      maxHitByLine.set(line.line, Math.max(previous, line.hit));
    }

    const uncoveredLineNumbers = [...maxHitByLine.entries()]
      .filter(([lineNumber, hit]) => hit === 0 && isInChangeset(lineNumber))
      .map(([lineNumber]) => lineNumber);
    const annotations: CheckAnnotation[] = [];

    const lineGroups = this.groupConsecutiveLines(uncoveredLineNumbers);

    for (const group of lineGroups) {
      const startLine = group[0];
      const endLine = group[group.length - 1];
      if (startLine === undefined || endLine === undefined) continue;

      annotations.push({
        path: file.path,
        start_line: startLine,
        end_line: endLine,
        annotation_level: "warning",
        title: "Uncovered Lines",
        message:
          group.length === 1
            ? `Line ${startLine} is not covered by tests`
            : `Lines ${startLine}-${endLine} are not covered by tests`,
      });
    }

    return annotations;
  }

  private generateUncoveredFunctionAnnotations(
    file: FileChangeWithCoverage,
  ): CheckAnnotation[] {
    if (!file.coverage) return [];

    const isInChangeset = this.changedLinePredicate(file);

    // A templated function is emitted once per instantiation, each a distinct
    // (very long) name sharing one line. Group by line so covering a single
    // instantiation counts as covered and every uncovered line yields at most
    // one annotation instead of one per instantiation.
    const functionsByLine = new Map<number, FunctionCoverage[]>();
    for (const func of file.coverage.functions) {
      const group = functionsByLine.get(func.line);
      if (group) {
        group.push(func);
      } else {
        functionsByLine.set(func.line, [func]);
      }
    }

    const annotations: CheckAnnotation[] = [];
    for (const [line, instantiations] of functionsByLine) {
      if (!isInChangeset(line)) continue;
      if (instantiations.some((func) => func.hit > 0)) continue;

      annotations.push({
        path: file.path,
        start_line: line,
        end_line: line,
        annotation_level: "warning",
        title: "Uncovered Function",
        message: this.formatUncoveredFunctionMessage(instantiations),
      });
    }

    return annotations;
  }

  // Builds a concise message for an uncovered function line. Templated code
  // maps to several instantiations sharing the line; we surface one readable
  // (truncated) name plus a count of the remaining instantiations rather than
  // listing every multi-hundred-character signature.
  private formatUncoveredFunctionMessage(
    instantiations: FunctionCoverage[],
  ): string {
    const uniqueNames = [...new Set(instantiations.map((func) => func.name))];
    const shortestName = uniqueNames.reduce((shortest, name) =>
      name.length < shortest.length ? name : shortest,
    );
    const displayName = this.truncateFunctionName(shortestName);
    const otherCount = uniqueNames.length - 1;

    if (otherCount > 0) {
      const suffix = otherCount === 1 ? "instantiation" : "instantiations";
      return `Function '${displayName}' (+${otherCount} template ${suffix}) is not covered by tests`;
    }

    return `Function '${displayName}' is not covered by tests`;
  }

  private truncateFunctionName(name: string): string {
    const maxLength = ChecksService.maxFunctionNameLength;
    if (name.length <= maxLength) return name;
    return `${name.slice(0, maxLength - 1)}\u2026`;
  }

  // Restricts uncovered-code annotations to changeset-touched lines. When
  // line-level diff data is unavailable (changedLines undefined) every line
  // qualifies, degrading gracefully instead of dropping all annotations.
  private changedLinePredicate(
    file: FileChangeWithCoverage,
  ): (line: number) => boolean {
    if (!file.changedLines) return () => true;
    const changed = new Set(file.changedLines);
    return (line) => changed.has(line);
  }

  private groupConsecutiveLines(lines: number[]): number[][] {
    if (lines.length === 0) return [];

    const sorted = [...lines].sort((a, b) => a - b);
    const groups: number[][] = [];
    let currentGroup: number[] = [];
    let previous: number | undefined;

    for (const line of sorted) {
      if (previous !== undefined && line === previous + 1) {
        currentGroup.push(line);
      } else {
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [line];
      }
      previous = line;
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    return groups;
  }

  private formatFileCoverageSummary(file: FileChangeWithCoverage): string {
    const { analysis } = file;
    return [
      `Coverage Summary for ${file.path}:`,
      `• Lines: ${analysis.coveredLines}/${analysis.totalLines} (${analysis.linesCoveragePercentage}%)`,
      `• Functions: ${analysis.coveredFunctions}/${analysis.totalFunctions} (${analysis.functionsCoveragePercentage}%)`,
      `• Branches: ${analysis.coveredBranches}/${analysis.totalBranches} (${analysis.branchesCoveragePercentage}%)`,
      `• Overall: ${analysis.overallCoveragePercentage}%`,
    ].join("\n");
  }

  private prioritizeAndLimitAnnotations(
    annotations: CheckAnnotation[],
  ): CheckAnnotation[] {
    const priorityOrder = { failure: 0, warning: 1, notice: 2 };
    const sorted = annotations.sort((a, b) => {
      const aPriority = priorityOrder[a.annotation_level];
      const bPriority = priorityOrder[b.annotation_level];
      return aPriority - bPriority;
    });

    if (sorted.length <= this.maxAnnotations) {
      return sorted;
    }

    core.warning(
      `Generated ${sorted.length} annotations, but GitHub Checks API supports maximum ${this.maxAnnotations}. Showing highest priority annotations.`,
    );
    return sorted.slice(0, this.maxAnnotations);
  }

  async postAnnotations(
    analysis: CoverageAnalysis,
    gatingResult: GatingResult,
    annotations: CheckAnnotation[],
    _prCommentUrl?: string,
  ): Promise<string | null> {
    if (!github.context.payload.pull_request) {
      core.warning(
        "Not running in a pull request context, skipping check annotations",
      );
      return null;
    }

    try {
      const appAuth = createAppAuth({
        appId: this.config.githubAppId,
        privateKey: this.config.githubAppPrivateKey,
      });

      const appOctokit = github.getOctokit(
        (await appAuth({ type: "app" })).token,
      );
      const { owner, repo } = github.context.repo;
      const { data: installation } =
        await appOctokit.rest.apps.getRepoInstallation({
          owner,
          repo,
        });

      const installationAuth = await appAuth({
        type: "installation",
        installationId: installation.id,
      });

      const octokit = github.getOctokit(installationAuth.token);
      const headSha = github.context.payload.pull_request.head.sha;

      const checkName = this.getCheckName();
      const title = this.generateCheckTitle(analysis);
      const summary = this.generateCheckSummary(analysis);
      const conclusion = this.determineCheckConclusion(gatingResult);

      core.info(`📊 Check conclusion: ${conclusion}`);
      core.info(
        `📈 Coverage: ${analysis.summary.overallCoverage.overallCoveragePercentage}% (Threshold: ${this.config.coverageThreshold}%)`,
      );

      const serverUrl = this.getServerUrl();
      const runId = process.env.GITHUB_RUN_ID;
      const actionsUrl = runId
        ? `${serverUrl}/${owner}/${repo}/actions/runs/${runId}`
        : `${serverUrl}/${owner}/${repo}/pull/${github.context.payload.pull_request.number}`;

      const createCheckResponse = await octokit.rest.checks.create({
        owner,
        repo,
        name: checkName,
        head_sha: headSha,
        status: "completed",
        conclusion,
        details_url: actionsUrl,
        output: {
          title,
          summary,
          annotations: annotations.slice(0, this.maxAnnotations),
        },
      });

      core.info(`✅ Posted ${annotations.length} annotations to GitHub Checks`);
      core.info(`🔗 Check run: ${createCheckResponse.data.html_url}`);

      return createCheckResponse.data.html_url;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      core.warning(`Failed to post check annotations: ${errorMessage}`);
      throw error;
    }
  }

  private generateCheckTitle(analysis: CoverageAnalysis): string {
    const coverage = analysis.summary.overallCoverage.overallCoveragePercentage;
    const filesWithCoverage = analysis.summary.filesWithCoverage;
    const totalFiles = analysis.summary.totalChangedFiles;

    return `Coverage: ${coverage}% (${filesWithCoverage}/${totalFiles} files)`;
  }

  private generateCheckSummary(analysis: CoverageAnalysis): string {
    const { summary } = analysis;
    const { overallCoverage } = summary;
    const threshold = this.config.coverageThreshold;

    const lines = [
      "## Coverage Analysis Summary",
      "",
      `**Overall Coverage:** ${overallCoverage.overallCoveragePercentage}% (Threshold: ${threshold}%)`,
      "",
      "### Changed Files",
      `- **Total files:** ${summary.totalChangedFiles}`,
      `- **Files with coverage:** ${summary.filesWithCoverage}`,
      `- **Files without coverage:** ${summary.filesWithoutCoverage}`,
      "",
      "### Coverage Breakdown",
      `- **Lines:** ${overallCoverage.coveredLines}/${overallCoverage.totalLines} (${overallCoverage.linesCoveragePercentage}%)`,
      `- **Functions:** ${overallCoverage.coveredFunctions}/${overallCoverage.totalFunctions} (${overallCoverage.functionsCoveragePercentage}%)`,
      `- **Branches:** ${overallCoverage.coveredBranches}/${overallCoverage.totalBranches} (${overallCoverage.branchesCoveragePercentage}%)`,
    ];

    if (summary.filesWithoutCoverage > 0) {
      lines.push("", "### ⚠️ Files Without Coverage");
      const { owner, repo } = github.context.repo;
      const headSha = github.context.payload.pull_request?.head.sha;
      const serverUrl = this.getServerUrl();

      analysis.changedFiles
        .filter((f) => !f.coverage)
        .forEach((f) => {
          const fileUrl = `${serverUrl}/${owner}/${repo}/blob/${headSha}/${f.path}`;
          lines.push(`- [${f.path}](${fileUrl})`);
        });
    }

    return lines.join("\n");
  }

  private determineCheckConclusion(
    gatingResult: GatingResult,
  ): "success" | "failure" | "neutral" {
    // Use the gating result to match the action's overall result
    return gatingResult.meetsThreshold ? "success" : "failure";
  }

  async createAnnotationsArtifact(
    annotations: CheckAnnotation[],
  ): Promise<string> {
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs");

    const tempDir = os.tmpdir();
    const annotationsPath = path.join(tempDir, "annotations.json");

    await fs.promises.writeFile(
      annotationsPath,
      JSON.stringify(annotations, null, 2),
      "utf8",
    );

    core.info(
      `📝 Created annotations.json with ${annotations.length} annotations`,
    );
    return annotationsPath;
  }
}
