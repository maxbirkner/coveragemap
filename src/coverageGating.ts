import { CoverageAnalysis } from "./coverageAnalyzer";
import { LcovReport } from "./lcov";
import { GateMode } from "./inputs";

export interface GatingResult {
  meetsThreshold: boolean;
  threshold: number;
  mode: "standard" | "baseline" | "disabled";
  prCoveragePercentage: number;
  overallProjectCoveragePercentage?: number;
  description: string;
  errorMessage?: string;
}

export class CoverageGating {
  static evaluate(
    analysis: CoverageAnalysis,
    lcovReport: LcovReport,
    gateMode: GateMode,
    threshold: number,
  ): GatingResult {
    const prCoveragePercentage =
      analysis.summary.overallCoverage.overallCoveragePercentage;

    const overallProjectCoveragePercentage =
      lcovReport.summary.linesFound > 0
        ? Math.round(
            (lcovReport.summary.linesHit / lcovReport.summary.linesFound) * 100,
          )
        : 100;

    // When gating is disabled the PR always passes; we still surface the
    // measured coverage so the comment and logs stay informative.
    if (gateMode === "none") {
      return {
        meetsThreshold: true,
        threshold,
        mode: "disabled",
        prCoveragePercentage,
        overallProjectCoveragePercentage,
        description: `ℹ️ Coverage gating disabled — PR coverage (${prCoveragePercentage}%) is not enforced`,
        errorMessage: undefined,
      };
    }

    // Baseline mode gates against the project's own coverage; threshold mode
    // gates against the explicit threshold value.
    const isBaseline = gateMode === "baseline";
    const requiredCoverage = isBaseline
      ? overallProjectCoveragePercentage
      : threshold;
    const meetsThreshold = prCoveragePercentage >= requiredCoverage;

    const target = isBaseline
      ? `overall project coverage (${overallProjectCoveragePercentage}%)`
      : `threshold (${threshold}%)`;
    const failureReason = isBaseline
      ? `is lower than overall project coverage (${overallProjectCoveragePercentage}%)`
      : `is below threshold (${threshold}%)`;

    return {
      meetsThreshold,
      threshold,
      mode: isBaseline ? "baseline" : "standard",
      prCoveragePercentage,
      overallProjectCoveragePercentage,
      description: meetsThreshold
        ? `✅ PR coverage (${prCoveragePercentage}%) meets or exceeds ${target}`
        : `❌ PR coverage (${prCoveragePercentage}%) is below ${target}`,
      errorMessage: meetsThreshold
        ? undefined
        : `Coverage gating failed: PR changes coverage (${prCoveragePercentage}%) ${failureReason}`,
    };
  }

  static format(result: GatingResult): string {
    const modeLabel =
      result.mode === "standard"
        ? "Standard Threshold"
        : result.mode === "baseline"
          ? "Project Baseline"
          : "Disabled";

    const lines = [
      "🎯 Coverage Gating Results",
      "═══════════════════════════",
      "",
      `📊 Mode: ${modeLabel}`,
      `📈 PR Coverage: ${result.prCoveragePercentage}%`,
    ];

    if (result.mode === "standard") {
      lines.push(`🎯 Threshold: ${result.threshold}%`);
    } else if (result.mode === "baseline") {
      lines.push(
        `📊 Project Coverage: ${result.overallProjectCoveragePercentage}%`,
      );
      lines.push(`🎯 Requirement: PR coverage ≥ Project coverage`);
    } else {
      lines.push(`🎯 Requirement: none (gating disabled)`);
    }

    lines.push("");
    lines.push(result.description);

    return lines.join("\n");
  }
}
