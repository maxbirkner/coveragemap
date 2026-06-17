import * as fs from "fs";
import * as path from "path";

import {
  aggregateSummary,
  applyRecordLine,
  createParseState,
  finalizeCurrentFile,
} from "./records";
import type { LcovReport } from "./types";

export class LcovParser {
  /**
   * Parse an LCOV file from the filesystem into a structured report.
   */
  static parseFile(filePath: string): LcovReport {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`LCOV file not found: ${absolutePath}`);
    }

    return this.parse(fs.readFileSync(absolutePath, "utf8"));
  }

  /**
   * Parse LCOV file content into a structured report.
   */
  static parse(content: string): LcovReport {
    const state = createParseState();

    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (line.length > 0) {
        applyRecordLine(state, line);
      }
    }

    // Handle a trailing file that doesn't end with end_of_record.
    finalizeCurrentFile(state);

    return {
      files: state.files,
      summary: aggregateSummary(state.files),
    };
  }
}
