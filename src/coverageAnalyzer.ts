import { Changeset, FileChange } from "./changeset";
import { LcovReport, FileCoverage, FunctionCoverage } from "./lcov";

export interface FileChangeWithCoverage extends FileChange {
  coverage?: FileCoverage;
  analysis: {
    totalLines: number;
    coveredLines: number;
    totalFunctions: number;
    coveredFunctions: number;
    totalBranches: number;
    coveredBranches: number;
    linesCoveragePercentage: number;
    functionsCoveragePercentage: number;
    branchesCoveragePercentage: number;
    overallCoveragePercentage: number;
  };
}

export interface CoverageAnalysis {
  changeset: Changeset;
  changedFiles: FileChangeWithCoverage[];
  summary: {
    totalChangedFiles: number;
    filesWithCoverage: number;
    filesWithoutCoverage: number;
    overallCoverage: {
      totalLines: number;
      coveredLines: number;
      totalFunctions: number;
      coveredFunctions: number;
      totalBranches: number;
      coveredBranches: number;
      linesCoveragePercentage: number;
      functionsCoveragePercentage: number;
      branchesCoveragePercentage: number;
      overallCoveragePercentage: number;
    };
  };
}

export class CoverageAnalyzer {
  // V8 emits a synthetic record for files it instrumented but found no
  // coverable code in (type-only modules, re-export barrels, ambient
  // declarations). The record is a single placeholder function with this exact
  // name plus every source line marked uncovered. Such files have nothing to
  // test, so flagging their lines/functions as "uncovered" — and counting them
  // as 0% in the totals — is misleading. We normalize them to empty coverage.
  private static readonly EMPTY_REPORT_FUNCTION_NAME = "(empty-report)";

  /**
   * Analyze coverage for the changed files in a changeset
   */
  static analyze(
    changeset: Changeset,
    lcovReport: LcovReport,
  ): CoverageAnalysis {
    const changedFiles: FileChangeWithCoverage[] = changeset.files.map(
      (fileChange) => {
        const rawCoverage = lcovReport.files.get(fileChange.path);
        const coverage = rawCoverage
          ? this.normalizeEmptyReport(rawCoverage)
          : undefined;

        if (coverage) {
          return {
            ...fileChange,
            coverage,
            analysis: this.calculateFileAnalysis(coverage),
          };
        } else {
          // File has no coverage data (e.g., not instrumented or no tests)
          return {
            ...fileChange,
            analysis: {
              totalLines: 0,
              coveredLines: 0,
              totalFunctions: 0,
              coveredFunctions: 0,
              totalBranches: 0,
              coveredBranches: 0,
              linesCoveragePercentage: 0,
              functionsCoveragePercentage: 0,
              branchesCoveragePercentage: 0,
              overallCoveragePercentage: 0,
            },
          };
        }
      },
    );

    const summary = this.calculateSummary(changedFiles);

    return {
      changeset,
      changedFiles,
      summary,
    };
  }

  /**
   * Detect V8's "(empty-report)" placeholder and replace it with genuinely
   * empty coverage. A file with no coverable code is fully covered by
   * definition, so this keeps it out of uncovered-line/function annotations and
   * stops its phantom lines from dragging down the aggregate percentages.
   */
  private static normalizeEmptyReport(coverage: FileCoverage): FileCoverage {
    const isEmptyReport =
      coverage.functions.length === 1 &&
      coverage.functions[0]?.name === this.EMPTY_REPORT_FUNCTION_NAME;

    if (!isEmptyReport) return coverage;

    return {
      path: coverage.path,
      functions: [],
      lines: [],
      branches: [],
      summary: {
        functionsFound: 0,
        functionsHit: 0,
        linesFound: 0,
        linesHit: 0,
        branchesFound: 0,
        branchesHit: 0,
      },
    };
  }

  /**
   * Calculate coverage analysis for a single file
   */
  private static calculateFileAnalysis(coverage: FileCoverage) {
    const { summary } = coverage;

    const linesCoveragePercentage =
      summary.linesFound > 0
        ? (summary.linesHit / summary.linesFound) * 100
        : 100;

    const functionsCoveragePercentage =
      summary.functionsFound > 0
        ? (summary.functionsHit / summary.functionsFound) * 100
        : 100;

    const branchesCoveragePercentage =
      summary.branchesFound > 0
        ? (summary.branchesHit / summary.branchesFound) * 100
        : 100;

    // Calculate overall coverage as weighted average
    const totalElements =
      summary.linesFound + summary.functionsFound + summary.branchesFound;
    const coveredElements =
      summary.linesHit + summary.functionsHit + summary.branchesHit;

    const overallCoveragePercentage =
      totalElements > 0 ? (coveredElements / totalElements) * 100 : 100;

    return {
      totalLines: summary.linesFound,
      coveredLines: summary.linesHit,
      totalFunctions: summary.functionsFound,
      coveredFunctions: summary.functionsHit,
      totalBranches: summary.branchesFound,
      coveredBranches: summary.branchesHit,
      linesCoveragePercentage: Math.round(linesCoveragePercentage * 100) / 100,
      functionsCoveragePercentage:
        Math.round(functionsCoveragePercentage * 100) / 100,
      branchesCoveragePercentage:
        Math.round(branchesCoveragePercentage * 100) / 100,
      overallCoveragePercentage:
        Math.round(overallCoveragePercentage * 100) / 100,
    };
  }

  /**
   * Calculate summary statistics for all changed files
   */
  private static calculateSummary(changedFiles: FileChangeWithCoverage[]) {
    const filesWithCoverage = changedFiles.filter((f) => f.coverage).length;
    const filesWithoutCoverage = changedFiles.length - filesWithCoverage;

    // Aggregate coverage data
    let totalLines = 0;
    let coveredLines = 0;
    let totalFunctions = 0;
    let coveredFunctions = 0;
    let totalBranches = 0;
    let coveredBranches = 0;

    for (const file of changedFiles) {
      totalLines += file.analysis.totalLines;
      coveredLines += file.analysis.coveredLines;
      totalFunctions += file.analysis.totalFunctions;
      coveredFunctions += file.analysis.coveredFunctions;
      totalBranches += file.analysis.totalBranches;
      coveredBranches += file.analysis.coveredBranches;
    }

    const linesCoveragePercentage =
      totalLines > 0 ? (coveredLines / totalLines) * 100 : 100;

    const functionsCoveragePercentage =
      totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 100;

    const branchesCoveragePercentage =
      totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 100;

    const totalElements = totalLines + totalFunctions + totalBranches;
    const coveredElements = coveredLines + coveredFunctions + coveredBranches;

    const overallCoveragePercentage =
      totalElements > 0 ? (coveredElements / totalElements) * 100 : 100;

    return {
      totalChangedFiles: changedFiles.length,
      filesWithCoverage,
      filesWithoutCoverage,
      overallCoverage: {
        totalLines,
        coveredLines,
        totalFunctions,
        coveredFunctions,
        totalBranches,
        coveredBranches,
        linesCoveragePercentage:
          Math.round(linesCoveragePercentage * 100) / 100,
        functionsCoveragePercentage:
          Math.round(functionsCoveragePercentage * 100) / 100,
        branchesCoveragePercentage:
          Math.round(branchesCoveragePercentage * 100) / 100,
        overallCoveragePercentage:
          Math.round(overallCoveragePercentage * 100) / 100,
      },
    };
  }

  /**
   * Get uncovered functions in changed files
   */
  static getUncoveredFunctions(analysis: CoverageAnalysis): Array<{
    file: string;
    functions: FunctionCoverage[];
  }> {
    return analysis.changedFiles
      .filter(
        (file): file is FileChangeWithCoverage & { coverage: FileCoverage } =>
          !!file.coverage,
      )
      .map((file) => ({
        file: file.path,
        functions: file.coverage.functions.filter((fn) => fn.hit === 0),
      }))
      .filter((item) => item.functions.length > 0);
  }

  /**
   * Get uncovered lines in changed files
   */
  static getUncoveredLines(analysis: CoverageAnalysis): Array<{
    file: string;
    lines: number[];
  }> {
    return analysis.changedFiles
      .filter(
        (file): file is FileChangeWithCoverage & { coverage: FileCoverage } =>
          !!file.coverage,
      )
      .map((file) => ({
        file: file.path,
        lines: file.coverage.lines
          .filter((line) => line.hit === 0)
          .map((line) => line.line),
      }))
      .filter((item) => item.lines.length > 0);
  }

  /**
   * Check if coverage meets the specified threshold
   * - If threshold > 0: PR coverage must meet the threshold
   * - If threshold = 0: PR coverage must be >= overall project coverage
   */
  static meetsCoverageThreshold(
    analysis: CoverageAnalysis,
    threshold: number,
    overallProjectCoverage?: number,
  ): boolean {
    const prCoverage =
      analysis.summary.overallCoverage.overallCoveragePercentage;

    if (threshold === 0) {
      // When threshold is 0, compare against overall project coverage
      if (overallProjectCoverage === undefined) {
        throw new Error(
          "Overall project coverage must be provided when threshold is 0",
        );
      }
      return prCoverage >= overallProjectCoverage;
    }

    // Normal threshold comparison
    return prCoverage >= threshold;
  }

  /**
   * Format coverage analysis as human-readable string
   */
  static format(analysis: CoverageAnalysis): string {
    const { summary } = analysis;
    const { overallCoverage } = summary;

    const lines = [
      "📊 Coverage Analysis for Changed Files",
      "═══════════════════════════════════════",
      "",
      `📁 Files analyzed: ${summary.totalChangedFiles}`,
      `✅ Files with coverage: ${summary.filesWithCoverage}`,
      `❌ Files without coverage: ${summary.filesWithoutCoverage}`,
      "",
      "📈 Overall Coverage:",
      `  Lines: ${overallCoverage.coveredLines}/${overallCoverage.totalLines} (${overallCoverage.linesCoveragePercentage}%)`,
      `  Functions: ${overallCoverage.coveredFunctions}/${overallCoverage.totalFunctions} (${overallCoverage.functionsCoveragePercentage}%)`,
      `  Branches: ${overallCoverage.coveredBranches}/${overallCoverage.totalBranches} (${overallCoverage.branchesCoveragePercentage}%)`,
      `  Overall: ${overallCoverage.overallCoveragePercentage}%`,
      "",
    ];

    if (analysis.changedFiles.length > 0) {
      lines.push("📂 File Details:");
      analysis.changedFiles.forEach((file) => {
        const status = file.coverage ? "✅" : "❌";
        const coverage = file.analysis.overallCoveragePercentage;
        lines.push(`  ${status} ${file.path} (${coverage}%)`);

        if (file.coverage && file.analysis.overallCoveragePercentage < 100) {
          const uncoveredFunctions = file.coverage.functions.filter(
            (fn) => fn.hit === 0,
          );
          const uncoveredLines = file.coverage.lines.filter(
            (line) => line.hit === 0,
          );

          if (uncoveredFunctions.length > 0) {
            lines.push(
              `    🔸 Uncovered functions: ${uncoveredFunctions
                .map((fn) => fn.name)
                .join(", ")}`,
            );
          }

          if (uncoveredLines.length > 0) {
            const lineNumbers = uncoveredLines
              .map((line) => line.line.toString())
              .slice(0, 10);
            const moreCount = uncoveredLines.length - lineNumbers.length;
            const linesList =
              moreCount > 0
                ? `${lineNumbers.join(", ")} (+${moreCount} more)`
                : lineNumbers.join(", ");
            lines.push(`    🔸 Uncovered lines: ${linesList}`);
          }
        }
      });
    }

    return lines.join("\n");
  }
}
