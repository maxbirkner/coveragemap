import * as core from "@actions/core";
import * as github from "@actions/github";
import { ChangesetService } from "./changesetService";
import { LcovParser, LcovReport } from "./lcov";
import { CoverageAnalyzer, CoverageAnalysis } from "./coverageAnalyzer";
import { Changeset } from "./changeset";
import { PrCommentService } from "./prComment";
import { CoverageGating, GatingResult } from "./coverageGating";
import { TreemapGenerator } from "./treemapGenerator";
import { ArtifactService, ArtifactInfo } from "./artifactService";
import { ChecksService } from "./checksService";

export interface ActionInputs {
  lcovFile: string;
  coverageThreshold: string;
  targetBranch: string;
  githubToken: string;
  label?: string;
  sourceCodePattern?: string;
  testCodePattern?: string;
  githubAppId?: string;
  githubAppPrivateKey?: string;
  treemapTitle?: string;
}

export function getInputs(): ActionInputs {
  const lcovFile = core.getInput("lcov-file") || "coverage/lcov.info";
  const coverageThreshold = core.getInput("coverage-threshold") || "80";
  const targetBranch = core.getInput("target-branch") || "main";
  const githubToken = core.getInput("github-token", { required: true });
  const label = core.getInput("label") || undefined;
  const sourceCodePattern = core.getInput("source-code-pattern") || undefined;
  const testCodePattern = core.getInput("test-code-pattern") || undefined;
  const githubAppId = core.getInput("github-app-id") || undefined;
  const githubAppPrivateKey =
    core.getInput("github-app-private-key") || undefined;
  const treemapTitle = core.getInput("treemap-title") || undefined;

  return {
    lcovFile,
    coverageThreshold,
    targetBranch,
    githubToken,
    label,
    sourceCodePattern,
    testCodePattern,
    githubAppId,
    githubAppPrivateKey,
    treemapTitle,
  };
}

export function printInputs(inputs: ActionInputs): void {
  core.info(`📁 LCOV file: ${inputs.lcovFile}`);
  core.info(`📊 Coverage threshold: ${inputs.coverageThreshold}%`);
  core.info(`🌿 Target branch: ${inputs.targetBranch}`);
  core.info(
    `🔑 GitHub token: ${inputs.githubToken ? "[PROVIDED]" : "[MISSING]"}`,
  );
  if (inputs.label) {
    core.info(`🏷️ Label: ${inputs.label}`);
  }
  if (inputs.sourceCodePattern) {
    core.info(`📂 Source code pattern: ${inputs.sourceCodePattern}`);
  }
  if (inputs.testCodePattern) {
    core.info(`🧪 Test code pattern: ${inputs.testCodePattern}`);
  }
  if (inputs.githubAppId && inputs.githubAppPrivateKey) {
    core.info(`🤖 GitHub App credentials: [PROVIDED]`);
  }
}

export async function detectChangeset(
  targetBranch: string,
  sourceCodePattern?: string,
  testCodePattern?: string,
): Promise<Changeset> {
  core.startGroup("🕵️‍♂️ Determining changeset");
  const changeset = await ChangesetService.detectCodeChanges(
    targetBranch,
    undefined,
    sourceCodePattern,
    testCodePattern,
  );
  ChangesetService.outputChangeset(changeset);
  core.endGroup();
  return changeset;
}

export async function parseLcovReport(lcovFile: string): Promise<LcovReport> {
  core.startGroup("📊 Parsing LCOV report");

  core.info(`📂 Reading LCOV file: ${lcovFile}`);

  const report = LcovParser.parseFile(lcovFile);

  core.info(`✅ Parsed ${report.summary.totalFiles} files from LCOV report`);
  core.info(
    `📈 Overall coverage: ${report.summary.linesHit}/${report.summary.linesFound} lines, ${report.summary.functionsHit}/${report.summary.functionsFound} functions`,
  );

  core.endGroup();
  return report;
}

export async function analyzeCoverageAndGating(
  changeset: Changeset,
  lcovReport: LcovReport,
  threshold: number,
): Promise<{ analysis: CoverageAnalysis; gatingResult: GatingResult }> {
  core.startGroup("🔍 Analyzing coverage for changed files");

  const analysis = CoverageAnalyzer.analyze(changeset, lcovReport);

  core.info(CoverageAnalyzer.format(analysis));

  const gatingResult = CoverageGating.evaluate(analysis, lcovReport, threshold);

  core.info(CoverageGating.format(gatingResult));

  core.setOutput(
    "coverage-percentage",
    analysis.summary.overallCoverage.overallCoveragePercentage,
  );
  core.setOutput("meets-threshold", gatingResult.meetsThreshold);
  core.setOutput("files-analyzed", analysis.summary.totalChangedFiles);
  core.setOutput("files-with-coverage", analysis.summary.filesWithCoverage);

  core.endGroup();
  return { analysis, gatingResult };
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
  core.startGroup("🗺️ Generating coverage treemap");

  try {
    const filesWithCoverage = analysis.changedFiles.filter((f) => f.coverage);
    if (filesWithCoverage.length === 0) {
      core.info("⏭️ Skipping treemap generation - no files with coverage data");
      core.endGroup();
      return null;
    }

    core.info("🎨 Generating treemap visualization...");

    try {
      const treemapPath = await TreemapGenerator.generatePNG(analysis, {
        width: 1200,
        height: 800,
        outputPath: "./coverage-treemap.png",
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
        30,
      );

      await artifactService.cleanupTempFiles([treemapPath]);

      core.info("✅ Treemap uploaded successfully");
      core.endGroup();
      return artifactInfo;
    } catch (error) {
      core.warning(
        `Failed to generate treemap: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      core.endGroup();
      return null;
    }
  } catch (error) {
    core.warning(
      `Failed to generate treemap: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    core.endGroup();
    return null;
  }
}

export async function postPrComment(
  analysis: CoverageAnalysis,
  lcovReport: LcovReport,
  gatingResult: GatingResult,
  githubToken: string,
  label?: string,
  treemapArtifact?: ArtifactInfo,
): Promise<string | null> {
  core.startGroup("💬 Posting PR comment");

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
    core.warning(
      `Failed to post PR comment: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    core.info(
      "🔍 This might be because the action is not running in a PR context or lacks permissions",
    );
    return null;
  } finally {
    core.endGroup();
  }
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

  core.startGroup("📝 Posting check annotations");

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
      core.endGroup();
      return;
    }

    const annotationsPath =
      await checksService.createAnnotationsArtifact(annotations);

    const artifactService = new ArtifactService();
    const artifactName = `coverage-annotations-${Date.now()}`;
    await artifactService.uploadArtifact(artifactName, annotationsPath, 30);

    await checksService.postAnnotations(
      analysis,
      gatingResult,
      annotations,
      prCommentUrl,
    );

    await artifactService.cleanupTempFiles([annotationsPath]);

    core.info(`✅ Posted ${annotations.length} check annotations successfully`);
  } catch (error) {
    core.warning(
      `Failed to post check annotations: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    core.info(
      "🔍 This might be because the action lacks permissions for the Checks API or GitHub App is not properly configured",
    );
  }

  core.endGroup();
}

export async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    printInputs(inputs);

    const changeset = await detectChangeset(
      inputs.targetBranch,
      inputs.sourceCodePattern,
      inputs.testCodePattern,
    );
    const lcovReport = await parseLcovReport(inputs.lcovFile);
    const threshold = parseFloat(inputs.coverageThreshold);

    const { analysis, gatingResult } = await analyzeCoverageAndGating(
      changeset,
      lcovReport,
      threshold,
    );

    const treemapArtifact = await generateAndUploadTreemap(
      analysis,
      inputs.treemapTitle,
    );

    const prCommentUrl = await postPrComment(
      analysis,
      lcovReport,
      gatingResult,
      inputs.githubToken,
      inputs.label,
      treemapArtifact || undefined,
    );

    await postCheckAnnotations(
      analysis,
      gatingResult,
      inputs.githubToken,
      threshold,
      inputs.githubAppId,
      inputs.githubAppPrivateKey,
      prCommentUrl || undefined,
      inputs.label,
    );

    if (!gatingResult.meetsThreshold) {
      core.setFailed(
        gatingResult.errorMessage ?? "Coverage threshold not met.",
      );
      return;
    }

    core.info("✅ Coverage Treemap Action completed successfully!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(errorMessage);
  }
}

run();
