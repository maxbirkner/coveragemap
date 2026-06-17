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

/**
 * Mutable per-file accumulator used while scanning an LCOV file. It is
 * finalised into an immutable {@link FileCoverage} when the record ends.
 */
interface CurrentFile {
  path: string;
  functions: FunctionCoverage[];
  lines: LineCoverage[];
  branches: BranchCoverage[];
  /**
   * Maps the per-file function index used by modern LCOV 2.x FNL/FNA records
   * to the line on which the function starts. Empty for legacy reports.
   */
  functionLineByIndex: Map<number, number>;
}

/** Running state threaded through the per-record handlers. */
interface ParseState {
  files: Map<string, FileCoverage>;
  current: CurrentFile | null;
}

/**
 * Handles a single LCOV record. `payload` is the text after the `TOKEN:`
 * prefix (empty for tokens without a colon, such as `end_of_record`).
 */
type RecordHandler = (state: ParseState, payload: string) => void;

function startNewFile(state: ParseState, path: string): void {
  finalizeCurrentFile(state);
  state.current = {
    path,
    functions: [],
    lines: [],
    branches: [],
    functionLineByIndex: new Map<number, number>(),
  };
}

function finalizeCurrentFile(state: ParseState): void {
  const current = state.current;
  if (!current) {
    return;
  }

  const functionsHit = current.functions.filter((f) => f.hit > 0).length;
  const linesHit = current.lines.filter((l) => l.hit > 0).length;
  const branchesHit = current.branches.filter((b) => b.taken > 0).length;

  state.files.set(current.path, {
    path: current.path,
    functions: current.functions,
    lines: current.lines,
    branches: current.branches,
    summary: {
      functionsFound: current.functions.length,
      functionsHit,
      linesFound: current.lines.length,
      linesHit,
      branchesFound: current.branches.length,
      branchesHit,
    },
  });
  state.current = null;
}

/**
 * Split an LCOV record payload into its leading numeric/fixed fields and a
 * trailing free-form name. LCOV function and test names may themselves contain
 * commas (notably C++ template signatures), so only the first `fixedFields`
 * commas are treated as separators and the remainder is rejoined as the name.
 */
function splitTrailingName(
  payload: string,
  fixedFields: number,
): { fields: string[]; name: string } {
  const parts = payload.split(",");
  const fields = parts.slice(0, fixedFields);
  const name = parts.slice(fixedFields).join(",");
  return { fields, name };
}

/**
 * Dispatch table keyed by the LCOV record token (the text before the first
 * colon). Using a lookup map keeps record handling flat and order-independent,
 * and lets legacy (FN/FNDA) and modern LCOV 2.x (FNL/FNA) function records be
 * supported side by side without a chain of conditionals.
 *
 * Spec: https://github.com/linux-test-project/lcov/blob/master/man/geninfo.1
 */
const RECORD_HANDLERS: Record<string, RecordHandler> = {
  // Source file - start of a new file record.
  SF: (state, payload) => startNewFile(state, payload),

  // Modern LCOV 2.x function location: FNL:<index>,<start_line>,<end_line>
  FNL: (state, payload) => {
    if (!state.current) {
      return;
    }
    const [indexStr, startStr] = payload.split(",");
    if (indexStr !== undefined && startStr !== undefined) {
      state.current.functionLineByIndex.set(
        parseInt(indexStr, 10),
        parseInt(startStr, 10),
      );
    }
  },

  // Modern LCOV 2.x function data: FNA:<index>,<hit>,<name>
  // A single FNL location may carry several aliased FNA records, each a
  // distinct function name sharing the same line range.
  FNA: (state, payload) => {
    if (!state.current) {
      return;
    }
    const { fields, name } = splitTrailingName(payload, 2);
    const [indexStr, hitStr] = fields;
    if (indexStr !== undefined && hitStr !== undefined && name.length > 0) {
      const line = state.current.functionLineByIndex.get(
        parseInt(indexStr, 10),
      );
      state.current.functions.push({
        name,
        line: line ?? 0,
        hit: parseInt(hitStr, 10),
      });
    }
  },

  // Legacy function definition: FN:<line>,<name>
  FN: (state, payload) => {
    if (!state.current) {
      return;
    }
    const { fields, name } = splitTrailingName(payload, 1);
    const [lineStr] = fields;
    if (lineStr !== undefined && name.length > 0) {
      state.current.functions.push({
        name,
        line: parseInt(lineStr, 10),
        hit: 0,
      });
    }
  },

  // Legacy function data: FNDA:<hit>,<name>
  FNDA: (state, payload) => {
    if (!state.current) {
      return;
    }
    const { fields, name } = splitTrailingName(payload, 1);
    const [hitStr] = fields;
    if (hitStr !== undefined && name.length > 0) {
      const func = state.current.functions.find((f) => f.name === name);
      if (func) {
        func.hit = parseInt(hitStr, 10);
      }
    }
  },

  // Line data: DA:<line>,<hit>
  DA: (state, payload) => {
    if (!state.current) {
      return;
    }
    const [lineStr, hitStr] = payload.split(",");
    if (lineStr !== undefined && hitStr !== undefined) {
      state.current.lines.push({
        line: parseInt(lineStr, 10),
        hit: parseInt(hitStr, 10),
      });
    }
  },

  // Branch data: BRDA:<line>,<block>,<branch>,<taken>
  BRDA: (state, payload) => {
    if (!state.current) {
      return;
    }
    const [lineStr, blockStr, branchStr, takenStr] = payload.split(",");
    if (
      lineStr !== undefined &&
      blockStr !== undefined &&
      branchStr !== undefined &&
      takenStr !== undefined
    ) {
      state.current.branches.push({
        line: parseInt(lineStr, 10),
        block: parseInt(blockStr, 10),
        branch: parseInt(branchStr, 10),
        taken: takenStr === "-" ? 0 : parseInt(takenStr, 10),
      });
    }
  },

  // End of the current file record.
  end_of_record: (state) => finalizeCurrentFile(state),
};

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
    const state: ParseState = {
      files: new Map<string, FileCoverage>(),
      current: null,
    };

    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }

      // Records are `TOKEN:payload`; tokens without a payload (e.g.
      // `end_of_record`) have no colon. Dispatching on the token keeps the
      // record handling flat and order-independent.
      const colonIndex = line.indexOf(":");
      const token = colonIndex === -1 ? line : line.substring(0, colonIndex);
      const payload = colonIndex === -1 ? "" : line.substring(colonIndex + 1);

      RECORD_HANDLERS[token]?.(state, payload);
    }

    // Handle a trailing file that doesn't end with end_of_record.
    finalizeCurrentFile(state);

    return {
      files: state.files,
      summary: this.calculateSummary(state.files),
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
