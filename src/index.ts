import * as core from "@actions/core";
import { ChangesetService } from "./changesetService";
import { LcovParser, LcovReport } from "./lcov";
import { CoverageAnalyzer, CoverageAnalysis } from "./coverageAnalyzer";
import { Changeset } from "./changeset";

export interface ActionInputs {
  lcovFile: string;
  coverageThreshold: string;
  targetBranch: string;
}

export function getInputs(): ActionInputs {
  const lcovFile = core.getInput("lcov-file") || "coverage/lcov.info";
  const coverageThreshold = core.getInput("coverage-threshold") || "80";
  const targetBranch = core.getInput("target-branch") || "main";

  return {
    lcovFile,
    coverageThreshold,
    targetBranch,
  };
}

function printInputs(inputs: ActionInputs): void {
  core.info(`📁 LCOV file: ${inputs.lcovFile}`);
  core.info(`📊 Coverage threshold: ${inputs.coverageThreshold}%`);
  core.info(`🌿 Target branch: ${inputs.targetBranch}`);
}

async function detectChangeset(targetBranch: string): Promise<Changeset> {
  core.startGroup("🕵️‍♂️ Determining changeset");
  const changeset = await ChangesetService.detectCodeChanges(targetBranch);
  ChangesetService.outputChangeset(changeset);
  core.endGroup();
  return changeset;
}

async function parseLcovReport(lcovFile: string): Promise<LcovReport> {
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

async function analyzeCoverage(
  changeset: Changeset,
  lcovReport: LcovReport,
  threshold: number,
): Promise<CoverageAnalysis> {
  core.startGroup("🔍 Analyzing coverage for changed files");

  const analysis = CoverageAnalyzer.analyze(changeset, lcovReport);

  core.info(CoverageAnalyzer.format(analysis));

  const meetsThreshold = CoverageAnalyzer.meetsCoverageThreshold(
    analysis,
    threshold,
  );
  core.info(`🎯 Coverage threshold: ${threshold}%`);
  core.info(`${meetsThreshold ? "✅" : "❌"} Threshold met: ${meetsThreshold}`);

  // Output results for use in workflow
  core.setOutput(
    "coverage-percentage",
    analysis.summary.overallCoverage.overallCoveragePercentage,
  );
  core.setOutput("meets-threshold", meetsThreshold);
  core.setOutput("files-analyzed", analysis.summary.totalChangedFiles);
  core.setOutput("files-with-coverage", analysis.summary.filesWithCoverage);

  core.endGroup();
  return analysis;
}

async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    printInputs(inputs);

    const changeset = await detectChangeset(inputs.targetBranch);
    const lcovReport = await parseLcovReport(inputs.lcovFile);
    const threshold = parseFloat(inputs.coverageThreshold);

    await analyzeCoverage(changeset, lcovReport, threshold);

    // TODO: Next steps will be implemented in future iterations
    // - Generate treemap visualization
    // - Post PR comment

    core.info("✅ Coverage Treemap Action completed successfully!");
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
