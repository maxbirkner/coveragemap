import * as core from "@actions/core";
import { ChangesetService } from "./changesetService";

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

async function detectChangeset(targetBranch: string): Promise<void> {
  core.startGroup("🕵️‍♂️ Determining changeset");
  const changeset = await ChangesetService.detectCodeChanges(targetBranch);
  ChangesetService.outputChangeset(changeset);
  core.endGroup();
}

async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    printInputs(inputs);

    await detectChangeset(inputs.targetBranch);

    // TODO: Next steps will be implemented in future iterations
    // - Parse LCOV report for function data
    // - Filter coverage for changed files & methods
    // - Calculate coverage percentage
    // - Generate treemap visualization
    // - Post PR comment

    core.info("✅ Coverage Treemap Action completed successfully!");
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
