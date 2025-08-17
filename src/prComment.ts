import * as core from "@actions/core";
import * as github from "@actions/github";
import { CoverageAnalysis } from "./coverageAnalyzer";
import { LcovReport } from "./lcov";
import { GatingResult } from "./coverageGating";
import { ArtifactInfo } from "./artifactService";

export interface PrCommentOptions {
  githubToken: string;
  label?: string;
}

export interface CommentData {
  totalCoverage: {
    linesHit: number;
    linesFound: number;
    percentage: number;
  };
  changedFilesCoverage: {
    linesHit: number;
    linesFound: number;
    percentage: number;
  };
  coverageDifference: number;
  fileBreakdown: Array<{
    filename: string;
    linesHit: number;
    linesFound: number;
    percentage: number;
  }>;
}

export class PrCommentService {
  private readonly octokit: ReturnType<typeof github.getOctokit>;
  private readonly label?: string;

  constructor(options: PrCommentOptions) {
    this.octokit = github.getOctokit(options.githubToken);
    this.label = options.label;
  }

  private getCommentTitle(): string {
    return this.label
      ? `Coveragemap Action: ${this.label}`
      : "Coveragemap Action";
  }

  static createCommentData(
    analysis: CoverageAnalysis,
    lcovReport: LcovReport,
  ): CommentData {
    const totalCoverage = {
      linesHit: lcovReport.summary.linesHit,
      linesFound: lcovReport.summary.linesFound,
      percentage:
        Math.round(
          (lcovReport.summary.linesHit / lcovReport.summary.linesFound) *
            100 *
            100,
        ) / 100,
    };

    const changedFilesCoverage = {
      linesHit: analysis.summary.overallCoverage.coveredLines,
      linesFound: analysis.summary.overallCoverage.totalLines,
      percentage: analysis.summary.overallCoverage.overallCoveragePercentage,
    };

    const coverageDifference =
      Math.round(
        (changedFilesCoverage.percentage - totalCoverage.percentage) * 100,
      ) / 100;

    const fileBreakdown = analysis.changedFiles
      .filter((file) => file.coverage) // Only include files with coverage data
      .map((file) => ({
        filename: file.path,
        linesHit: file.analysis.coveredLines,
        linesFound: file.analysis.totalLines,
        percentage: file.analysis.overallCoveragePercentage,
      }));

    return {
      totalCoverage,
      changedFilesCoverage,
      coverageDifference,
      fileBreakdown,
    };
  }

  private generateCommentBody(
    data: CommentData,
    gatingResult: GatingResult,
    treemapArtifact?: ArtifactInfo,
  ): string {
    const title = this.getCommentTitle();
    const thresholdEmoji = gatingResult.meetsThreshold ? "✅" : "❌";
    const diffEmoji = data.coverageDifference >= 0 ? "📈" : "📉";
    const diffSign = data.coverageDifference >= 0 ? "+" : "";

    const thresholdDisplay =
      gatingResult.mode === "baseline"
        ? `≥ Project Avg (${gatingResult.overallProjectCoveragePercentage}%)`
        : `${gatingResult.threshold}%`;

    let markdown = `## ${title}\n\n`;

    // Summary table
    markdown += `| Metric | Coverage | Lines |\n`;
    markdown += `|--------|----------|-------|\n`;
    markdown += `| **Total Coverage** | ${data.totalCoverage.percentage}% | ${data.totalCoverage.linesHit}/${data.totalCoverage.linesFound} |\n`;
    markdown += `| **Changed Files** | ${data.changedFilesCoverage.percentage}% | ${data.changedFilesCoverage.linesHit}/${data.changedFilesCoverage.linesFound} |\n`;
    markdown += `| **Difference** | ${diffEmoji} ${diffSign}${data.coverageDifference}% | - |\n`;
    markdown += `| **Threshold** | ${thresholdEmoji} ${thresholdDisplay} | - |\n\n`;

    // File breakdown if there are any files with coverage data
    if (data.fileBreakdown.length > 0) {
      markdown += `### Changed Files Coverage\n\n`;
      markdown += `| File | Coverage | Lines |\n`;
      markdown += `|------|----------|-------|\n`;

      for (const file of data.fileBreakdown) {
        const fileThresholdMet =
          gatingResult.mode === "baseline"
            ? file.percentage >= gatingResult.overallProjectCoveragePercentage!
            : file.percentage >= gatingResult.threshold;
        const fileEmoji = fileThresholdMet ? "✅" : "❌";
        markdown += `| ${fileEmoji} \`${file.filename}\` | ${file.percentage}% | ${file.linesHit}/${file.linesFound} |\n`;
      }
      markdown += `\n`;
    }

    // Add treemap visualization if available
    if (treemapArtifact) {
      markdown += `### 📊 Coverage Treemap Visualization\n\n`;
      markdown += `A visual treemap has been generated showing coverage by function/method:\n`;
      markdown += `- 🟢 **Green**: Fully covered functions\n`;
      markdown += `- 🟠 **Orange**: Partially covered functions\n`;
      markdown += `- 🔴 **Red**: Uncovered functions\n\n`;
      markdown += `📎 **Artifact**: \`${
        treemapArtifact.name
      }\` (${this.formatFileSize(treemapArtifact.size)})\n\n`;

      const downloadUrl =
        treemapArtifact.downloadUrl || this.getArtifactDownloadUrl();
      const linkText = treemapArtifact.downloadUrl
        ? "direct download"
        : "Actions tab";
      markdown += `> 📥 **[Download treemap visualization](${downloadUrl})** - Click for ${linkText}\n\n`;
    }

    // Footer
    markdown += `---\n`;
    markdown += `*Coverage report generated by [Coveragemap Action](https://github.com/maxbirkner/coveragemap)*`;

    return markdown;
  }

  private async findExistingComment(): Promise<number | null> {
    const { context } = github;

    if (!context.payload.pull_request) {
      throw new Error("This action can only be run on pull requests");
    }

    const comments = await this.octokit.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.pull_request.number,
    });

    const commentTitle = this.getCommentTitle();

    for (const comment of comments.data) {
      if (comment.body?.includes(`## ${commentTitle}`)) {
        return comment.id;
      }
    }

    return null;
  }

  async postComment(
    analysis: CoverageAnalysis,
    lcovReport: LcovReport,
    gatingResult: GatingResult,
    treemapArtifact?: ArtifactInfo,
  ): Promise<void> {
    const { context } = github;

    if (!context.payload.pull_request) {
      throw new Error("This action can only be run on pull requests");
    }

    const data = PrCommentService.createCommentData(analysis, lcovReport);
    const body = this.generateCommentBody(data, gatingResult, treemapArtifact);

    try {
      const existingCommentId = await this.findExistingComment();

      if (existingCommentId) {
        // Update existing comment
        await this.octokit.rest.issues.updateComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: existingCommentId,
          body,
        });

        core.info(`✅ Updated existing PR comment (ID: ${existingCommentId})`);
      } else {
        // Create new comment
        const response = await this.octokit.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: context.payload.pull_request.number,
          body,
        });

        core.info(`✅ Created new PR comment (ID: ${response.data.id})`);
      }
    } catch (error) {
      throw new Error(
        `Failed to post PR comment: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Format file size in human readable format
   */
  private formatFileSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Get the download URL for artifacts
   */
  private getArtifactDownloadUrl(): string {
    const { context } = github;
    const runId = process.env.GITHUB_RUN_ID || "unknown";
    return `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${runId}`;
  }
}

/**
 * Standalone function for generating comment body (for testing)
 */
export function generateCommentBody(
  analysis: CoverageAnalysis,
  gatingResult?: GatingResult,
  artifactInfo?: ArtifactInfo,
): string {
  const service = new PrCommentService({ githubToken: "test" });

  // Create mock lcov report
  const mockLcovReport = {
    files: new Map(),
    summary: {
      totalFiles: 1,
      linesFound: 100,
      linesHit: 80,
      functionsFound: 10,
      functionsHit: 8,
      branchesFound: 20,
      branchesHit: 16,
    },
  };

  const commentData = PrCommentService.createCommentData(
    analysis,
    mockLcovReport,
  );

  if (!gatingResult) {
    gatingResult = {
      meetsThreshold: true,
      threshold: 80,
      mode: "standard" as const,
      prCoveragePercentage:
        analysis.summary.overallCoverage.overallCoveragePercentage,
      description: "Mock gating result for testing",
    };
  }

  return (
    service as unknown as {
      generateCommentBody: (
        data: CommentData,
        gatingResult: GatingResult,
        artifactInfo?: ArtifactInfo,
      ) => string;
    }
  ).generateCommentBody(commentData, gatingResult, artifactInfo);
}

/**
 * Standalone function for formatting file size (for testing)
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
