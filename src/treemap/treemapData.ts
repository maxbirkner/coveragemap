import * as path from "path";
import { CoverageAnalysis, FileChangeWithCoverage } from "../coverageAnalyzer";
import { FunctionCoverage, FileCoverage, LineCoverage } from "../lcov";
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

export function generateTreemapData(analysis: CoverageAnalysis): TreemapData {
  return {
    name: "Coverage Analysis",
    children: analysis.changedFiles
      .filter((file) => !hasNoCoverableCode(file))
      .map(buildFileGroup),
  };
}

/**
 * A file that was instrumented but contains no coverable code (e.g. a
 * type-only module) carries an empty coverage object after normalization. There
 * is nothing meaningful to visualise for it, so it is omitted from the treemap.
 * Files without any coverage data are still shown as uncovered tiles.
 */
function hasNoCoverableCode(file: FileChangeWithCoverage): boolean {
  return (
    file.coverage !== undefined &&
    file.coverage.functions.length === 0 &&
    file.analysis.totalLines === 0
  );
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
 * Resolve the half-open line span `[start, end)` attributed to a function: from
 * its declaration line up to (but excluding) the next function's declaration.
 * The last function in a file has no upper bound.
 */
function getFunctionLineRange(
  func: FunctionCoverage,
  fileCoverage: FileCoverage,
): { startLine: number; endLine: number } {
  const functions = [...fileCoverage.functions].sort((a, b) => a.line - b.line);
  const funcIndex = functions.findIndex(
    (f) => f.name === func.name && f.line === func.line,
  );

  if (funcIndex === -1) {
    return { startLine: func.line, endLine: func.line + 1 };
  }

  const nextFunc = functions[funcIndex + 1];
  return {
    startLine: func.line,
    endLine: nextFunc ? nextFunc.line : Number.POSITIVE_INFINITY,
  };
}

/**
 * Collect the coverable (instrumented) lines that fall within a function's
 * span. Only lines the report actually tracks are coverable: non-executable
 * lines such as type definitions, interface members, comments and braces never
 * appear in the LCOV `DA` records, so they are excluded. This keeps a
 * function's denominator equal to the lines that can genuinely be covered.
 */
function getFunctionCoverableLines(
  func: FunctionCoverage,
  fileCoverage: FileCoverage,
): LineCoverage[] {
  const { startLine, endLine } = getFunctionLineRange(func, fileCoverage);
  return fileCoverage.lines.filter(
    (line) => line.line >= startLine && line.line < endLine,
  );
}

/**
 * Count the coverable lines attributed to a function. This is the denominator
 * for the tile's coverage ratio and drives its relative size.
 */
function getFunctionLineCount(
  func: FunctionCoverage,
  fileCoverage: FileCoverage,
): number {
  return getFunctionCoverableLines(func, fileCoverage).length;
}

/** Count the covered (hit) lines among a function's coverable lines. */
function getFunctionCoveredLines(
  func: FunctionCoverage,
  fileCoverage: FileCoverage,
): number {
  return getFunctionCoverableLines(func, fileCoverage).filter(
    (line) => line.hit > 0,
  ).length;
}
