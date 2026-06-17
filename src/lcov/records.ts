import type {
  BranchCoverage,
  CoverageCounts,
  FileCoverage,
  FunctionCoverage,
  LineCoverage,
} from "./types";

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
export interface ParseState {
  files: Map<string, FileCoverage>;
  current: CurrentFile | null;
}

export function createParseState(): ParseState {
  return { files: new Map<string, FileCoverage>(), current: null };
}

/**
 * Handles a single LCOV record. `payload` is the text after the `TOKEN:`
 * prefix (empty for tokens without a colon, such as `end_of_record`).
 */
type RecordHandler = (state: ParseState, payload: string) => void;

/** A handler that only runs while a file record is open. */
type FileRecordHandler = (file: CurrentFile, payload: string) => void;

/**
 * Wrap a {@link FileRecordHandler} so it is skipped when no SF record has
 * opened a file yet, collapsing the otherwise-repeated null guard.
 */
function withinFile(handler: FileRecordHandler): RecordHandler {
  return (state, payload) => {
    if (state.current) {
      handler(state.current, payload);
    }
  };
}

const int = (value: string): number => parseInt(value, 10);

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
  return {
    fields: parts.slice(0, fixedFields),
    name: parts.slice(fixedFields).join(","),
  };
}

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

export function finalizeCurrentFile(state: ParseState): void {
  const current = state.current;
  if (!current) {
    return;
  }

  state.files.set(current.path, {
    path: current.path,
    functions: current.functions,
    lines: current.lines,
    branches: current.branches,
    summary: {
      functionsFound: current.functions.length,
      functionsHit: current.functions.filter((f) => f.hit > 0).length,
      linesFound: current.lines.length,
      linesHit: current.lines.filter((l) => l.hit > 0).length,
      branchesFound: current.branches.length,
      branchesHit: current.branches.filter((b) => b.taken > 0).length,
    },
  });
  state.current = null;
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
  FNL: withinFile((file, payload) => {
    const [indexStr, startStr] = payload.split(",");
    if (indexStr !== undefined && startStr !== undefined) {
      file.functionLineByIndex.set(int(indexStr), int(startStr));
    }
  }),

  // Modern LCOV 2.x function data: FNA:<index>,<hit>,<name>
  // A single FNL location may carry several aliased FNA records, each a
  // distinct function name sharing the same line range.
  FNA: withinFile((file, payload) => {
    const { fields, name } = splitTrailingName(payload, 2);
    const [indexStr, hitStr] = fields;
    if (indexStr !== undefined && hitStr !== undefined && name.length > 0) {
      file.functions.push({
        name,
        line: file.functionLineByIndex.get(int(indexStr)) ?? 0,
        hit: int(hitStr),
      });
    }
  }),

  // Legacy function definition: FN:<line>,<name>
  FN: withinFile((file, payload) => {
    const { fields, name } = splitTrailingName(payload, 1);
    const [lineStr] = fields;
    if (lineStr !== undefined && name.length > 0) {
      file.functions.push({ name, line: int(lineStr), hit: 0 });
    }
  }),

  // Legacy function data: FNDA:<hit>,<name>
  FNDA: withinFile((file, payload) => {
    const { fields, name } = splitTrailingName(payload, 1);
    const [hitStr] = fields;
    if (hitStr !== undefined && name.length > 0) {
      const func = file.functions.find((f) => f.name === name);
      if (func) {
        func.hit = int(hitStr);
      }
    }
  }),

  // Line data: DA:<line>,<hit>
  DA: withinFile((file, payload) => {
    const [lineStr, hitStr] = payload.split(",");
    if (lineStr !== undefined && hitStr !== undefined) {
      file.lines.push({ line: int(lineStr), hit: int(hitStr) });
    }
  }),

  // Branch data: BRDA:<line>,<block>,<branch>,<taken>
  BRDA: withinFile((file, payload) => {
    const [lineStr, blockStr, branchStr, takenStr] = payload.split(",");
    if (
      lineStr !== undefined &&
      blockStr !== undefined &&
      branchStr !== undefined &&
      takenStr !== undefined
    ) {
      file.branches.push({
        line: int(lineStr),
        block: int(blockStr),
        branch: int(branchStr),
        // A `-` taken count means the branch was never reached.
        taken: takenStr === "-" ? 0 : int(takenStr),
      });
    }
  }),

  // End of the current file record.
  end_of_record: (state) => finalizeCurrentFile(state),
};

/**
 * Apply a single LCOV line to the running state. Lines are `TOKEN:payload`;
 * tokens without a payload (e.g. `end_of_record`) have no colon. Unknown
 * tokens are ignored, keeping the parser tolerant of summary records (LF, LH,
 * FNF, ...) it does not need.
 */
export function applyRecordLine(state: ParseState, line: string): void {
  const colonIndex = line.indexOf(":");
  const token = colonIndex === -1 ? line : line.substring(0, colonIndex);
  const payload = colonIndex === -1 ? "" : line.substring(colonIndex + 1);

  RECORD_HANDLERS[token]?.(state, payload);
}

/** Reduce per-file summaries into the report-wide totals. */
export function aggregateSummary(
  files: Map<string, FileCoverage>,
): CoverageCounts & { totalFiles: number } {
  const totals = {
    totalFiles: files.size,
    functionsFound: 0,
    functionsHit: 0,
    linesFound: 0,
    linesHit: 0,
    branchesFound: 0,
    branchesHit: 0,
  };

  for (const { summary } of files.values()) {
    totals.functionsFound += summary.functionsFound;
    totals.functionsHit += summary.functionsHit;
    totals.linesFound += summary.linesFound;
    totals.linesHit += summary.linesHit;
    totals.branchesFound += summary.branchesFound;
    totals.branchesHit += summary.branchesHit;
  }

  return totals;
}
