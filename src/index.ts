import * as core from "@actions/core";
import { ChangesetService } from "./changesetService";
import { LcovParser, LcovReport } from "./lcov";
import { CoverageAnalyzer, CoverageAnalysis } from "./coverageAnalyzer";
import { Changeset } from "./changeset";
import { PrCommentService } from "./prComment";
import { CoverageGating, GatingResult } from "./coverageGating";

export interface ActionInputs {
  lcovFile: string;
  coverageThreshold: string;
  targetBranch: string;
  githubToken: string;
  label?: string;
  sourceCodePattern?: string;
  testCodePattern?: string;
}

export function getInputs(): ActionInputs {
  const lcovFile = core.getInput("lcov-file") || "coverage/lcov.info";
  const coverageThreshold = core.getInput("coverage-threshold") || "80";
  const targetBranch = core.getInput("target-branch") || "main";
  const githubToken = core.getInput("github-token", { required: true });
  const label = core.getInput("label") || undefined;
  const sourceCodePattern = core.getInput("source-code-pattern") || undefined;
  const testCodePattern = core.getInput("test-code-pattern") || undefined;

  return {
    lcovFile,
    coverageThreshold,
    targetBranch,
    githubToken,
    label,
    sourceCodePattern,
    testCodePattern,
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
}

export async function detectChangeset(
  targetBranch: string,
  sourceCodePattern?: string,
  testCodePattern?: string,
): Promise<Changeset> {
  core.startGroup("🕵️‍♂️ Determining changeset");
  const changeset = await ChangesetService.detectCodeChanges(
    targetBranch,
    undefined, // extensions - will be undefined to use patterns instead
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

  // Evaluate threshold gating
  const gatingResult = CoverageGating.evaluate(analysis, lcovReport, threshold);

  core.info(CoverageGating.format(gatingResult));

  // Output results for use in workflow
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

export async function postPrComment(
  analysis: CoverageAnalysis,
  lcovReport: LcovReport,
  gatingResult: GatingResult,
  githubToken: string,
  label?: string,
): Promise<void> {
  core.startGroup("💬 Posting PR comment");

  try {
    const commentService = new PrCommentService({
      githubToken,
      label,
    });

    await commentService.postComment(analysis, lcovReport, gatingResult);

    core.info("✅ PR comment posted successfully");
  } catch (error) {
    core.warning(
      `Failed to post PR comment: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    core.info(
      "🔍 This might be because the action is not running in a PR context or lacks permissions",
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

    await postPrComment(
      analysis,
      lcovReport,
      gatingResult,
      inputs.githubToken,
      inputs.label,
    );

    if (!gatingResult.meetsThreshold) {
      core.setFailed(gatingResult.errorMessage!);
      return;
    }

    core.info("✅ Coverage Treemap Action completed successfully!");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(errorMessage);
  }
}

run();
