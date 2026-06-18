import * as core from "@actions/core";

export const GATE_MODES = ["threshold", "baseline", "none"] as const;
export type GateMode = (typeof GATE_MODES)[number];

export interface ActionInputs {
  lcovFile: string;
  coverageThreshold: string;
  gateMode: GateMode;
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

function parseGateMode(): GateMode {
  const raw = (core.getInput("gate-mode") || "threshold").trim().toLowerCase();
  if (!GATE_MODES.includes(raw as GateMode)) {
    throw new Error(
      `Invalid gate-mode "${raw}". Expected one of: ${GATE_MODES.join(", ")}.`,
    );
  }
  return raw as GateMode;
}

export function getInputs(): ActionInputs {
  const lcovFile = core.getInput("lcov-file") || "coverage/lcov.info";
  const coverageThreshold = core.getInput("coverage-threshold") || "80";
  const gateMode = parseGateMode();
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
    gateMode,
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
  core.info(`🚦 Gate mode: ${inputs.gateMode}`);
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
