import { CoverageAnalysis } from "./coverageAnalyzer";
import { LcovReport } from "./lcov";

export interface GatingResult {
  meetsThreshold: boolean;
  threshold: number;
  mode: "standard" | "baseline";
  prCoveragePercentage: number;
  overallProjectCoveragePercentage?: number;
  description: string;
  errorMessage?: string;
}

export class CoverageGating {
  static evaluate(
    analysis: CoverageAnalysis,
    lcovReport: LcovReport,
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

    // When threshold is 0 we gate against the project's own coverage
    // (baseline mode); otherwise against the explicit threshold.
    const isBaseline = threshold === 0;
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
    const lines = [
      "🎯 Coverage Gating Results",
      "═══════════════════════════",
      "",
      `📊 Mode: ${
        result.mode === "standard" ? "Standard Threshold" : "Project Baseline"
      }`,
      `📈 PR Coverage: ${result.prCoveragePercentage}%`,
    ];

    if (result.mode === "standard") {
      lines.push(`🎯 Threshold: ${result.threshold}%`);
    } else {
      lines.push(
        `📊 Project Coverage: ${result.overallProjectCoveragePercentage}%`,
      );
      lines.push(`🎯 Requirement: PR coverage ≥ Project coverage`);
    }

    lines.push("");
    lines.push(result.description);

    return lines.join("\n");
  }
}
