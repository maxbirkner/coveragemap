import * as core from "@actions/core";
import * as github from "@actions/github";
import { CoverageAnalysis } from "./coverageAnalyzer";
import { LcovReport } from "./lcov";
import { GatingResult } from "./coverageGating";
import { ArtifactInfo } from "./artifactService";
import { formatFileSize } from "./formatBytes";

export { formatFileSize } from "./formatBytes";

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
    return buildCommentBody(
      this.getCommentTitle(),
      data,
      gatingResult,
      treemapArtifact,
    );
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
  ): Promise<string | null> {
    const { context } = github;

    if (!context.payload.pull_request) {
      throw new Error("This action can only be run on pull requests");
    }

    const data = PrCommentService.createCommentData(analysis, lcovReport);
    const body = this.generateCommentBody(data, gatingResult, treemapArtifact);

    try {
      const existingCommentId = await this.findExistingComment();
      const serverUrl =
        context.serverUrl ||
        process.env.GITHUB_SERVER_URL ||
        "https://github.com";
      const { owner, repo } = context.repo;
      const prNumber = context.payload.pull_request.number;
      const commentUrl = (commentId: number) =>
        `${serverUrl}/${owner}/${repo}/pull/${prNumber}#issuecomment-${commentId}`;

      if (existingCommentId) {
        // Update existing comment
        await this.octokit.rest.issues.updateComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: existingCommentId,
          body,
        });

        core.info(`✅ Updated existing PR comment (ID: ${existingCommentId})`);
        return commentUrl(existingCommentId);
      } else {
        // Create new comment
        const response = await this.octokit.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: context.payload.pull_request.number,
          body,
        });

        core.info(`✅ Created new PR comment (ID: ${response.data.id})`);
        return commentUrl(response.data.id);
      }
    } catch (error) {
      throw new Error(
        `Failed to post PR comment: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }
}

const PR_COMMENT_TITLE = "Coveragemap Action";

/**
 * Build the markdown body for a coverage PR comment. Pure function shared by
 * the PrCommentService instance method and the standalone test helper so the
 * exact rendering lives in a single place.
 */
function buildCommentBody(
  title: string,
  data: CommentData,
  gatingResult: GatingResult,
  treemapArtifact?: ArtifactInfo,
): string {
  // When the PR touches no lines that carry coverage data there is nothing
  // to compare, so we render placeholders instead of a misleading 100% /
  // +diff / green threshold.
  const hasChangedLines = data.changedFilesCoverage.linesFound > 0;

  const thresholdDisplay =
    gatingResult.mode === "disabled"
      ? "Gating disabled"
      : gatingResult.mode === "baseline"
        ? `≥ Project Avg (${gatingResult.overallProjectCoveragePercentage}%)`
        : `${gatingResult.threshold}%`;

  const changedFilesCell = hasChangedLines
    ? `${data.changedFilesCoverage.percentage}% | ${formatLines(
        data.changedFilesCoverage.linesHit,
        data.changedFilesCoverage.linesFound,
      )}`
    : `– | –`;

  const differenceCell = hasChangedLines
    ? `${
        data.coverageDifference > 0
          ? "📈"
          : data.coverageDifference < 0
            ? "📉"
            : "➖"
      } ${data.coverageDifference > 0 ? "+" : ""}${data.coverageDifference}%`
    : `–`;

  const thresholdCell =
    gatingResult.mode === "disabled"
      ? `ℹ️ ${thresholdDisplay}`
      : hasChangedLines
        ? `${gatingResult.meetsThreshold ? "✅" : "❌"} ${thresholdDisplay}`
        : `➖ ${thresholdDisplay} (no changed lines)`;

  let markdown = `## ${title}\n\n`;

  // Summary table
  markdown += `| Metric | Coverage | Lines |\n`;
  markdown += `|--------|----------|-------|\n`;
  markdown += `| **Total Coverage** | ${
    data.totalCoverage.percentage
  }% | ${formatLines(
    data.totalCoverage.linesHit,
    data.totalCoverage.linesFound,
  )} |\n`;
  markdown += `| **Changed Files** | ${changedFilesCell} |\n`;
  markdown += `| **Difference** | ${differenceCell} | - |\n`;
  markdown += `| **Threshold** | ${thresholdCell} | - |\n\n`;

  // File breakdown if there are any files with coverage data
  if (data.fileBreakdown.length > 0) {
    markdown += `### Changed Files Coverage\n\n`;
    markdown += `| File | Coverage | Lines |\n`;
    markdown += `|------|----------|-------|\n`;

    for (const file of data.fileBreakdown) {
      let fileEmoji: string;
      if (gatingResult.mode === "disabled") {
        fileEmoji = "ℹ️";
      } else {
        const fileThresholdMet =
          gatingResult.mode === "baseline"
            ? file.percentage >= gatingResult.overallProjectCoveragePercentage!
            : file.percentage >= gatingResult.threshold;
        fileEmoji = fileThresholdMet ? "✅" : "❌";
      }
      markdown += `| ${fileEmoji} \`${file.filename}\` | ${
        file.percentage
      }% | ${formatLines(file.linesHit, file.linesFound)} |\n`;
    }
    markdown += `\n`;
  }

  // Add treemap visualization if available
  if (treemapArtifact) {
    markdown += `### 📊 Coverage Treemap Visualization\n\n`;
    markdown += `A visual treemap has been generated showing coverage by function/method.\n\n`;
    markdown += `📎 **Artifact**: \`${treemapArtifact.name}\` (${formatFileSize(
      treemapArtifact.size,
    )})\n\n`;

    const downloadUrl = treemapArtifact.downloadUrl || getArtifactDownloadUrl();
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

/**
 * Format a hit/found line pair with thousands separators so large
 * line counts stay readable (e.g. 63162/100542 -> 63,162/100,542).
 */
function formatLines(linesHit: number, linesFound: number): string {
  return `${formatLineCount(linesHit)}/${formatLineCount(linesFound)}`;
}

/**
 * Get the download URL for artifacts
 */
function getArtifactDownloadUrl(): string {
  const { context } = github;
  const runId = process.env.GITHUB_RUN_ID || "unknown";
  return `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${runId}`;
}

/**
 * Standalone function for generating comment body (for testing)
 */
export function generateCommentBody(
  analysis: CoverageAnalysis,
  gatingResult?: GatingResult,
  artifactInfo?: ArtifactInfo,
): string {
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

  return buildCommentBody(
    PR_COMMENT_TITLE,
    commentData,
    gatingResult,
    artifactInfo,
  );
}

// Reused across every line-pair we render so we don't allocate a new
// formatter on each call. Rounds to whole numbers since line counts are
// always integers.
const LINE_COUNT_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/**
 * Format a line count with en-US thousands separators (e.g. 100542 -> 100,542).
 */
export function formatLineCount(value: number): string {
  return LINE_COUNT_FORMATTER.format(value);
}
