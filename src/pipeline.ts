import * as core from "@actions/core";
import * as github from "@actions/github";
import { ChangesetService } from "./changesetService";
import { LcovParser, LcovReport } from "./lcov";
import { CoverageAnalyzer, CoverageAnalysis } from "./coverageAnalyzer";
import { Changeset } from "./changeset";
import { PrCommentService, renderCoverageReport } from "./prComment";
import { CoverageGating, GatingResult } from "./coverageGating";
import { TreemapGenerator } from "./treemap/treemapGenerator";
import { ArtifactService, ArtifactInfo } from "./artifactService";
import { ChecksService } from "./checksService";
import { GateMode } from "./inputs";
import { toErrorMessage } from "./errors";
const TREEMAP_OUTPUT_PATH = "./coverage-treemap.png";
const ARTIFACT_RETENTION_DAYS = 30;

/**
 * Runs `fn` inside a collapsible log group, guaranteeing the group is closed
 * even when `fn` throws. Centralising the start/end pairing removes the
 * repeated try/finally scaffolding from each pipeline step. `fn` may be sync or
 * async so the helper stays usable for either kind of step.
 */
async function withGroup<T>(
  label: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  core.startGroup(label);
  try {
    return await fn();
  } finally {
    core.endGroup();
  }
}

export async function detectChangeset(
  targetBranch: string,
  sourceCodePattern?: string,
  testCodePattern?: string,
): Promise<Changeset> {
  return withGroup("🕵️‍♂️ Determining changeset", async () => {
    const changeset = await ChangesetService.detectCodeChanges(
      targetBranch,
      undefined,
      sourceCodePattern,
      testCodePattern,
    );
    ChangesetService.outputChangeset(changeset);
    return changeset;
  });
}

export async function parseLcovReport(lcovFile: string): Promise<LcovReport> {
  return withGroup("📊 Parsing LCOV report", async () => {
    core.info(`📂 Reading LCOV file: ${lcovFile}`);

    const report = LcovParser.parseFile(lcovFile);

    core.info(`✅ Parsed ${report.summary.totalFiles} files from LCOV report`);
    core.info(
      `📈 Overall coverage: ${report.summary.linesHit}/${report.summary.linesFound} lines, ${report.summary.functionsHit}/${report.summary.functionsFound} functions`,
    );

    return report;
  });
}

export async function analyzeCoverageAndGating(
  changeset: Changeset,
  lcovReport: LcovReport,
  gateMode: GateMode,
  threshold: number,
): Promise<{ analysis: CoverageAnalysis; gatingResult: GatingResult }> {
  return withGroup("🔍 Analyzing coverage for changed files", async () => {
    const analysis = CoverageAnalyzer.analyze(changeset, lcovReport);

    core.info(CoverageAnalyzer.format(analysis));

    const gatingResult = CoverageGating.evaluate(
      analysis,
      lcovReport,
      gateMode,
      threshold,
    );

    core.info(CoverageGating.format(gatingResult));

    core.setOutput(
      "coverage-percentage",
      analysis.summary.overallCoverage.overallCoveragePercentage,
    );
    core.setOutput("meets-threshold", gatingResult.meetsThreshold);
    core.setOutput("files-analyzed", analysis.summary.totalChangedFiles);
    core.setOutput("files-with-coverage", analysis.summary.filesWithCoverage);

    return { analysis, gatingResult };
  });
}

export function buildTreemapSubtitle(): string {
  // The commit of the repository the action runs in. On pull_request events
  // GITHUB_SHA is a synthetic merge commit, so prefer the PR head sha.
  const sha =
    github.context.payload.pull_request?.head?.sha ||
    process.env.GITHUB_SHA ||
    "";
  const shortSha = sha ? sha.substring(0, 7) : "unknown";
  const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `commit ${shortSha} · generated ${generatedAt} UTC`;
}

export async function generateAndUploadTreemap(
  analysis: CoverageAnalysis,
  title?: string,
): Promise<ArtifactInfo | null> {
  return withGroup("🗺️ Generating coverage treemap", async () => {
    try {
      const filesWithCoverage = analysis.changedFiles.filter((f) => f.coverage);
      if (filesWithCoverage.length === 0) {
        core.info(
          "⏭️ Skipping treemap generation - no files with coverage data",
        );
        return null;
      }

      core.info("🎨 Generating treemap visualization...");
      const treemapPath = await TreemapGenerator.generatePNG(analysis, {
        width: 1200,
        height: 800,
        outputPath: TREEMAP_OUTPUT_PATH,
        title: title || "Coverage Treemap",
        subtitle: buildTreemapSubtitle(),
      });
      core.info(`✅ Treemap generated: ${treemapPath}`);

      const artifactService = new ArtifactService();
      const artifactName = artifactService.generateTreemapArtifactName();

      core.info("📤 Uploading treemap as artifact...");
      const artifactInfo = await artifactService.uploadArtifact(
        artifactName,
        treemapPath,
        ARTIFACT_RETENTION_DAYS,
      );

      await artifactService.cleanupTempFiles([treemapPath]);

      core.info("✅ Treemap uploaded successfully");
      return artifactInfo;
    } catch (error) {
      core.warning(`Failed to generate treemap: ${toErrorMessage(error)}`);
      return null;
    }
  });
}

export async function postPrComment(
  analysis: CoverageAnalysis,
  lcovReport: LcovReport,
  gatingResult: GatingResult,
  githubToken: string,
  label?: string,
  treemapArtifact?: ArtifactInfo,
): Promise<string | null> {
  return withGroup("💬 Posting PR comment", async () => {
    try {
      const commentService = new PrCommentService({
        githubToken,
        label,
      });

      const commentUrl = await commentService.postComment(
        analysis,
        lcovReport,
        gatingResult,
        treemapArtifact,
      );

      core.info("✅ PR comment posted successfully");
      if (commentUrl) {
        core.info(`💬 View PR comment: ${commentUrl}`);
      }
      return commentUrl;
    } catch (error) {
      core.warning(`Failed to post PR comment: ${toErrorMessage(error)}`);
      core.info(
        "🔍 This might be because the action is not running in a PR context or lacks permissions",
      );
      return null;
    }
  });
}

export async function writeJobSummary(
  analysis: CoverageAnalysis,
  lcovReport: LcovReport,
  gatingResult: GatingResult,
  label?: string,
  treemapArtifact?: ArtifactInfo,
): Promise<void> {
  return withGroup("📝 Writing job summary", async () => {
    try {
      const body = renderCoverageReport(analysis, lcovReport, gatingResult, {
        label,
        treemapArtifact,
      });

      await core.summary.addRaw(body).addEOL().write();

      core.info("✅ Job summary written successfully");
    } catch (error) {
      core.warning(`Failed to write job summary: ${toErrorMessage(error)}`);
    }
  });
}

export async function postCheckAnnotations(
  analysis: CoverageAnalysis,
  gatingResult: GatingResult,
  githubToken: string,
  coverageThreshold: number,
  githubAppId?: string,
  githubAppPrivateKey?: string,
  prCommentUrl?: string,
  label?: string,
): Promise<void> {
  if (!ChecksService.isEnabled(githubAppId, githubAppPrivateKey)) {
    core.info(
      "⏭️ Skipping check annotations - GitHub App credentials not provided",
    );
    return;
  }

  return withGroup("📝 Posting check annotations", async () => {
    try {
      const checksService = new ChecksService({
        githubAppId: githubAppId!,
        githubAppPrivateKey: githubAppPrivateKey!,
        githubToken,
        coverageThreshold,
        label,
      });

      const annotations = checksService.generateAnnotations(analysis);

      if (annotations.length === 0) {
        core.info("ℹ️ No annotations to post - all files have good coverage");
        return;
      }

      const annotationsPath =
        await checksService.createAnnotationsArtifact(annotations);

      const artifactService = new ArtifactService();
      const artifactName = `coverage-annotations-${Date.now()}`;
      await artifactService.uploadArtifact(
        artifactName,
        annotationsPath,
        ARTIFACT_RETENTION_DAYS,
      );

      await checksService.postAnnotations(
        analysis,
        gatingResult,
        annotations,
        prCommentUrl,
      );

      await artifactService.cleanupTempFiles([annotationsPath]);

      core.info(
        `✅ Posted ${annotations.length} check annotations successfully`,
      );
    } catch (error) {
      core.warning(
        `Failed to post check annotations: ${toErrorMessage(error)}`,
      );
      core.info(
        "🔍 This might be because the action lacks permissions for the Checks API or GitHub App is not properly configured",
      );
    }
  });
}
