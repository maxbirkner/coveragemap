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

function optionalInput(name: string): string | undefined {
  return core.getInput(name) || undefined;
}

export function getInputs(): ActionInputs {
  const lcovFile = core.getInput("lcov-file") || "coverage/lcov.info";
  const coverageThreshold = core.getInput("coverage-threshold") || "80";
  const targetBranch = core.getInput("target-branch") || "main";
  const githubToken = core.getInput("github-token", { required: true });
  const label = optionalInput("label");
  const sourceCodePattern = optionalInput("source-code-pattern");
  const testCodePattern = optionalInput("test-code-pattern");
  const githubAppId = optionalInput("github-app-id");
  const githubAppPrivateKey = optionalInput("github-app-private-key");
  const treemapTitle = optionalInput("treemap-title");

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
