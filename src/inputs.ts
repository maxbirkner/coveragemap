import * as core from "@actions/core";

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
