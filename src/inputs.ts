import * as core from "@actions/core";

export const GATE_MODES = ["threshold", "baseline", "none"] as const;
export type GateMode = (typeof GATE_MODES)[number];

export interface ActionInputs {
  lcovFile: string;
  coverageThreshold: string;
  gateMode: GateMode;
  targetBranch: string;
  githubToken: string;
  prComment: boolean;
  jobSummary: boolean;
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

const TRUE_VALUES = ["true", "True", "TRUE"];
const FALSE_VALUES = ["false", "False", "FALSE"];

// Mirrors @actions/core.getBooleanInput's YAML 1.2 "Core Schema" handling but
// falls back to a default when the input is absent so callers can omit it.
function parseBooleanInput(name: string, defaultValue: boolean): boolean {
  const raw = core.getInput(name);
  if (raw === "") {
    return defaultValue;
  }
  if (TRUE_VALUES.includes(raw)) {
    return true;
  }
  if (FALSE_VALUES.includes(raw)) {
    return false;
  }
  throw new TypeError(
    `Input does not meet YAML 1.2 "Core Schema" specification: ${name}\n` +
      "Support boolean input list: `true | True | TRUE | false | False | FALSE`",
  );
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
  const prComment = parseBooleanInput("pr-comment", true);
  const jobSummary = parseBooleanInput("job-summary", false);
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
    prComment,
    jobSummary,
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
  core.info(`💬 PR comment: ${inputs.prComment ? "enabled" : "disabled"}`);
  core.info(`📝 Job summary: ${inputs.jobSummary ? "enabled" : "disabled"}`);
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
