import * as path from "path";
import { CoverageAnalysis, FileChangeWithCoverage } from "./coverageAnalyzer";
import { FunctionCoverage, FileCoverage } from "./lcov";
import {
  CoverageState,
  TreemapData,
  TreemapFileGroup,
  TreemapNode,
} from "./treemapModel";

/**
 * Transforms a {@link CoverageAnalysis} into the {@link TreemapData} hierarchy
 * the renderer consumes. Each changed file becomes a group of function tiles,
 * or a single file-level tile when no per-function data exists.
 */

// Fallback line count when a function's span cannot be derived from the report.
const DEFAULT_FUNCTION_LINE_COUNT = 10;
// Minimum span assumed for the last function in a file, past its start line.
const MIN_FUNCTION_SIZE_ESTIMATE = 10;

export function generateTreemapData(analysis: CoverageAnalysis): TreemapData {
  return {
    name: "Coverage Analysis",
    children: analysis.changedFiles.map(buildFileGroup),
  };
}

function buildFileGroup(file: FileChangeWithCoverage): TreemapFileGroup {
  const basename = path.basename(file.path);

  if (!file.coverage) {
    // File without coverage data - treat as a single uncovered tile.
    return wrapInGroup(basename, file.path, {
      name: basename,
      file: file.path,
      value: Math.max(file.analysis.totalLines, 1),
      coverage: "none",
      lineCount: file.analysis.totalLines,
      coveredLines: 0,
    });
  }

  if (file.coverage.functions.length > 0) {
    const tiles = file.coverage.functions.map((func) =>
      buildFunctionTile(func, file.coverage as FileCoverage, file.path),
    );
    return { name: basename, file: file.path, children: tiles };
  }

  // File has coverage but no functions - single file-level tile.
  const coveredLines = file.analysis.coveredLines;
  return wrapInGroup(basename, file.path, {
    name: basename,
    file: file.path,
    value: Math.max(file.analysis.totalLines, 1),
    coverage: classifyCoverage(coveredLines, file.analysis.totalLines),
    lineCount: file.analysis.totalLines,
    coveredLines,
  });
}

function buildFunctionTile(
  func: FunctionCoverage,
  coverage: FileCoverage,
  filePath: string,
): TreemapNode {
  const lineCount = getFunctionLineCount(func, coverage);
  const coveredLines = getFunctionCoveredLines(func, coverage);

  return {
    name: func.name,
    file: filePath,
    value: Math.max(lineCount, 1), // Ensure minimum size
    coverage: classifyCoverage(coveredLines, lineCount),
    lineCount,
    coveredLines,
    functionName: func.name,
  };
}

/** Wrap a single tile in a file group with the same name and path. */
function wrapInGroup(
  name: string,
  file: string,
  tile: TreemapNode,
): TreemapFileGroup {
  return { name, file, children: [tile] };
}

/** Classify coverage from covered vs. total lines. */
function classifyCoverage(covered: number, total: number): CoverageState {
  if (covered <= 0) return "none";
  if (covered >= total) return "full";
  return "partial";
}

/**
 * Estimate the number of lines a function spans. The range runs from the
 * function's declaration to the next function's declaration; the last function
 * in a file is estimated from the highest recorded line number.
 */
function getFunctionLineCount(
  func: FunctionCoverage,
  fileCoverage: FileCoverage,
): number {
  const functions = [...fileCoverage.functions].sort((a, b) => a.line - b.line);
  const funcIndex = functions.findIndex(
    (f) => f.name === func.name && f.line === func.line,
  );

  const currentFunc = funcIndex === -1 ? undefined : functions[funcIndex];
  if (!currentFunc) return DEFAULT_FUNCTION_LINE_COUNT;

  const nextFunc = functions[funcIndex + 1];
  if (nextFunc) {
    return Math.max(nextFunc.line - currentFunc.line, 1);
  }

  // Last function - estimate based on file lines.
  const maxLine = Math.max(
    ...fileCoverage.lines.map((l) => l.line),
    currentFunc.line + MIN_FUNCTION_SIZE_ESTIMATE,
  );
  return Math.max(maxLine - currentFunc.line, 1);
}

/** Count hit lines that fall within a function's estimated span. */
function getFunctionCoveredLines(
  func: FunctionCoverage,
  fileCoverage: FileCoverage,
): number {
  const startLine = func.line;
  const endLine = startLine + getFunctionLineCount(func, fileCoverage);

  return fileCoverage.lines.filter(
    (line) => line.line >= startLine && line.line < endLine && line.hit > 0,
  ).length;
}
