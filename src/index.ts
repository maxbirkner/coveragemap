import * as core from "@actions/core";
import { getInputs, printInputs } from "./inputs";
import {
  detectChangeset,
  parseLcovReport,
  analyzeCoverageAndGating,
  generateAndUploadTreemap,
  postPrComment,
  postCheckAnnotations,
} from "./pipeline";
import { toErrorMessage } from "./errors";

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
      inputs.gateMode,
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
    core.setFailed(toErrorMessage(error));
  }
}

run();
