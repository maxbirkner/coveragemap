import * as core from "@actions/core";
import * as github from "@actions/github";
import { createAppAuth } from "@octokit/auth-app";
import { CoverageAnalysis, FileChangeWithCoverage } from "./coverageAnalyzer";

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
}

export class ChecksService {
  private config: ChecksServiceConfig;
  private maxAnnotations = 50;

  constructor(config: ChecksServiceConfig) {
    this.config = config;
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

      if (file.analysis.overallCoveragePercentage < 80) {
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

    const uncoveredLines = file.coverage.lines.filter((line) => line.hit === 0);
    const annotations: CheckAnnotation[] = [];

    const lineGroups = this.groupConsecutiveLines(
      uncoveredLines.map((l) => l.line),
    );

    for (const group of lineGroups) {
      const startLine = group[0];
      const endLine = group[group.length - 1];

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

    const uncoveredFunctions = file.coverage.functions.filter(
      (fn) => fn.hit === 0,
    );
    const annotations: CheckAnnotation[] = [];

    for (const func of uncoveredFunctions) {
      annotations.push({
        path: file.path,
        start_line: func.line,
        end_line: func.line,
        annotation_level: "warning",
        title: "Uncovered Function",
        message: `Function '${func.name}' is not covered by tests`,
      });
    }

    return annotations;
  }

  private groupConsecutiveLines(lines: number[]): number[][] {
    if (lines.length === 0) return [];

    const sorted = [...lines].sort((a, b) => a - b);
    const groups: number[][] = [];
    let currentGroup = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        currentGroup.push(sorted[i]);
      } else {
        groups.push(currentGroup);
        currentGroup = [sorted[i]];
      }
    }
    groups.push(currentGroup);

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
    annotations: CheckAnnotation[],
  ): Promise<void> {
    if (!github.context.payload.pull_request) {
      core.warning(
        "Not running in a pull request context, skipping check annotations",
      );
      return;
    }

    try {
      // Create GitHub App authenticated Octokit instance
      const appAuth = createAppAuth({
        appId: this.config.githubAppId,
        privateKey: this.config.githubAppPrivateKey,
      });

      // Get installation ID from the current repository
      const installationAuth = await appAuth({
        type: "installation",
        installationId: github.context.payload.installation?.id,
      });

      const octokit = github.getOctokit(installationAuth.token);
      const { owner, repo } = github.context.repo;
      const headSha = github.context.payload.pull_request.head.sha;

      const checkName = "Coverage Treemap Action";
      const title = this.generateCheckTitle(analysis);
      const summary = this.generateCheckSummary(analysis);

      const createCheckResponse = await octokit.rest.checks.create({
        owner,
        repo,
        name: checkName,
        head_sha: headSha,
        status: "completed",
        conclusion: this.determineCheckConclusion(analysis),
        output: {
          title,
          summary,
          annotations: annotations.slice(0, this.maxAnnotations),
        },
      });

      core.info(`✅ Posted ${annotations.length} annotations to GitHub Checks`);
      core.info(`🔗 Check run: ${createCheckResponse.data.html_url}`);
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

    const lines = [
      "## Coverage Analysis Summary",
      "",
      `**Overall Coverage:** ${overallCoverage.overallCoveragePercentage}%`,
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
      analysis.changedFiles
        .filter((f) => !f.coverage)
        .forEach((f) => lines.push(`- ${f.path}`));
    }

    return lines.join("\n");
  }

  private determineCheckConclusion(
    analysis: CoverageAnalysis,
  ): "success" | "failure" | "neutral" {
    if (analysis.summary.filesWithoutCoverage > 0) {
      return "neutral";
    }

    if (analysis.summary.overallCoverage.overallCoveragePercentage >= 80) {
      return "success";
    }

    return "neutral";
  }

  async createAnnotationsArtifact(
    annotations: CheckAnnotation[],
  ): Promise<string> {
    const annotationsPath = "./annotations.json";
    const fs = await import("node:fs");

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
