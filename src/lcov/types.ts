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

/** Aggregate found/hit counts shared by file- and report-level summaries. */
export interface CoverageCounts {
  functionsFound: number;
  functionsHit: number;
  linesFound: number;
  linesHit: number;
  branchesFound: number;
  branchesHit: number;
}

export interface FileCoverage {
  path: string;
  functions: FunctionCoverage[];
  lines: LineCoverage[];
  branches: BranchCoverage[];
  summary: CoverageCounts;
}

export interface LcovReport {
  files: Map<string, FileCoverage>;
  summary: CoverageCounts & { totalFiles: number };
}
