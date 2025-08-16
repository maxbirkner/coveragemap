import * as fs from "fs";
import * as path from "path";

export interface FunctionCoverage {
  name: string;
  line: number;
  hit: number;
}

export interface LineCoverage {
  line: number;
  hit: number;
}

export interface BranchCoverage {
  line: number;
  block: number;
  branch: number;
  taken: number;
}

export interface FileCoverage {
  path: string;
  functions: FunctionCoverage[];
  lines: LineCoverage[];
  branches: BranchCoverage[];
  summary: {
    functionsFound: number;
    functionsHit: number;
    linesFound: number;
    linesHit: number;
    branchesFound: number;
    branchesHit: number;
  };
}

export interface LcovReport {
  files: Map<string, FileCoverage>;
  summary: {
    totalFiles: number;
    functionsFound: number;
    functionsHit: number;
    linesFound: number;
    linesHit: number;
    branchesFound: number;
    branchesHit: number;
  };
}

export class LcovParser {
  /**
   * Parse an LCOV file from filesystem into a structured report
   */
  static parseFile(filePath: string): LcovReport {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`LCOV file not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, "utf8");
    return this.parse(content);
  }

  /**
   * Parse an LCOV file content string into a structured report
   */
  static parse(content: string): LcovReport {
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const files = new Map<string, FileCoverage>();

    let currentFile: Partial<FileCoverage> | null = null;
    let currentFunctions: FunctionCoverage[] = [];
    let currentLines: LineCoverage[] = [];
    let currentBranches: BranchCoverage[] = [];

    for (const line of lines) {
      if (line.startsWith("SF:")) {
        // Source file - start of new file record
        if (currentFile && currentFile.path) {
          // Save previous file if exists
          const fileCoverage = this.finalizeFileCoverage(
            currentFile,
            currentFunctions,
            currentLines,
            currentBranches,
          );
          files.set(fileCoverage.path, fileCoverage);
        }

        // Start new file
        currentFile = { path: line.substring(3) };
        currentFunctions = [];
        currentLines = [];
        currentBranches = [];
      } else if (line.startsWith("FN:")) {
        // Function definition: FN:<line>,<name>
        const parts = line.substring(3).split(",");
        if (parts.length >= 2) {
          const lineNum = parseInt(parts[0], 10);
          const name = parts.slice(1).join(","); // In case function name contains commas
          currentFunctions.push({ name, line: lineNum, hit: 0 });
        }
      } else if (line.startsWith("FNDA:")) {
        // Function data: FNDA:<hit>,<name>
        const parts = line.substring(5).split(",");
        if (parts.length >= 2) {
          const hit = parseInt(parts[0], 10);
          const name = parts.slice(1).join(",");

          // Update existing function with hit count
          const func = currentFunctions.find((f) => f.name === name);
          if (func) {
            func.hit = hit;
          }
        }
      } else if (line.startsWith("DA:")) {
        // Line data: DA:<line>,<hit>
        const parts = line.substring(3).split(",");
        if (parts.length >= 2) {
          const lineNum = parseInt(parts[0], 10);
          const hit = parseInt(parts[1], 10);
          currentLines.push({ line: lineNum, hit });
        }
      } else if (line.startsWith("BRDA:")) {
        // Branch data: BRDA:<line>,<block>,<branch>,<taken>
        const parts = line.substring(5).split(",");
        if (parts.length >= 4) {
          const lineNum = parseInt(parts[0], 10);
          const block = parseInt(parts[1], 10);
          const branch = parseInt(parts[2], 10);
          const taken = parts[3] === "-" ? 0 : parseInt(parts[3], 10);
          currentBranches.push({ line: lineNum, block, branch, taken });
        }
      } else if (line === "end_of_record") {
        // End of current file record
        if (currentFile && currentFile.path) {
          const fileCoverage = this.finalizeFileCoverage(
            currentFile,
            currentFunctions,
            currentLines,
            currentBranches,
          );
          files.set(fileCoverage.path, fileCoverage);
          currentFile = null;
        }
      }
    }

    // Handle case where file doesn't end with end_of_record
    if (currentFile && currentFile.path) {
      const fileCoverage = this.finalizeFileCoverage(
        currentFile,
        currentFunctions,
        currentLines,
        currentBranches,
      );
      files.set(fileCoverage.path, fileCoverage);
    }

    const summary = this.calculateSummary(files);

    return {
      files,
      summary,
    };
  }

  private static finalizeFileCoverage(
    file: Partial<FileCoverage>,
    functions: FunctionCoverage[],
    lines: LineCoverage[],
    branches: BranchCoverage[],
  ): FileCoverage {
    const functionsHit = functions.filter((f) => f.hit > 0).length;
    const linesHit = lines.filter((l) => l.hit > 0).length;
    const branchesHit = branches.filter((b) => b.taken > 0).length;

    return {
      path: file.path!,
      functions,
      lines,
      branches,
      summary: {
        functionsFound: functions.length,
        functionsHit,
        linesFound: lines.length,
        linesHit,
        branchesFound: branches.length,
        branchesHit,
      },
    };
  }

  private static calculateSummary(files: Map<string, FileCoverage>) {
    let functionsFound = 0;
    let functionsHit = 0;
    let linesFound = 0;
    let linesHit = 0;
    let branchesFound = 0;
    let branchesHit = 0;

    for (const file of files.values()) {
      functionsFound += file.summary.functionsFound;
      functionsHit += file.summary.functionsHit;
      linesFound += file.summary.linesFound;
      linesHit += file.summary.linesHit;
      branchesFound += file.summary.branchesFound;
      branchesHit += file.summary.branchesHit;
    }

    return {
      totalFiles: files.size,
      functionsFound,
      functionsHit,
      linesFound,
      linesHit,
      branchesFound,
      branchesHit,
    };
  }
}
