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

    if (threshold === 0) {
      // Project baseline mode
      const meetsThreshold =
        prCoveragePercentage >= overallProjectCoveragePercentage;

      return {
        meetsThreshold,
        threshold,
        mode: "baseline",
        prCoveragePercentage,
        overallProjectCoveragePercentage,
        description: meetsThreshold
          ? `✅ PR coverage (${prCoveragePercentage}%) meets or exceeds overall project coverage (${overallProjectCoveragePercentage}%)`
          : `❌ PR coverage (${prCoveragePercentage}%) is below overall project coverage (${overallProjectCoveragePercentage}%)`,
        errorMessage: meetsThreshold
          ? undefined
          : `Coverage gating failed: PR changes coverage (${prCoveragePercentage}%) is lower than overall project coverage (${overallProjectCoveragePercentage}%)`,
      };
    } else {
      // Standard threshold mode
      const meetsThreshold = prCoveragePercentage >= threshold;

      return {
        meetsThreshold,
        threshold,
        mode: "standard",
        prCoveragePercentage,
        overallProjectCoveragePercentage,
        description: meetsThreshold
          ? `✅ PR coverage (${prCoveragePercentage}%) meets or exceeds threshold (${threshold}%)`
          : `❌ PR coverage (${prCoveragePercentage}%) is below threshold (${threshold}%)`,
        errorMessage: meetsThreshold
          ? undefined
          : `Coverage gating failed: PR changes coverage (${prCoveragePercentage}%) is below threshold (${threshold}%)`,
      };
    }
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
