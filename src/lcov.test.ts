import { LcovParser } from "./lcov";
import * as fs from "fs";
import * as path from "path";

// Mock fs module for testing
jest.mock("fs");
const mockedFs = fs as jest.Mocked<typeof fs>;

describe("LcovParser", () => {
  describe("parseFile", () => {
    it("should read and parse LCOV file from filesystem", () => {
      const mockContent = `TN:
SF:src/example.ts
FN:5,myFunction
FNF:1
FNH:1
FNDA:1,myFunction
DA:5,1
LF:1
LH:1
BRF:0
BRH:0
end_of_record`;

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(mockContent);

      const report = LcovParser.parseFile("./test/lcov.info");

      expect(mockedFs.existsSync).toHaveBeenCalledWith(
        path.resolve("./test/lcov.info"),
      );
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        path.resolve("./test/lcov.info"),
        "utf8",
      );
      expect(report.files.size).toBe(1);
      expect(report.files.get("src/example.ts")).toBeDefined();
    });

    it("should throw error when file does not exist", () => {
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => LcovParser.parseFile("./nonexistent.info")).toThrow(
        "LCOV file not found: " + path.resolve("./nonexistent.info"),
      );
    });
  });

  describe("parse", () => {
    it("should parse a simple LCOV file", () => {
      const content = `TN:
SF:src/example.ts
FN:5,myFunction
FN:10,anotherFunction
FNF:2
FNH:1
FNDA:3,myFunction
FNDA:0,anotherFunction
DA:1,1
DA:2,0
DA:5,3
DA:10,0
LF:4
LH:2
BRDA:1,0,0,1
BRDA:1,0,1,0
BRF:2
BRH:1
end_of_record`;

      const report = LcovParser.parse(content);

      expect(report.files.size).toBe(1);
      expect(report.summary.totalFiles).toBe(1);

      const file = report.files.get("src/example.ts");
      expect(file).toBeDefined();
      expect(file!.path).toBe("src/example.ts");
      expect(file!.functions).toHaveLength(2);
      expect(file!.lines).toHaveLength(4);
      expect(file!.branches).toHaveLength(2);

      // Function coverage
      expect(file!.functions[0].name).toBe("myFunction");
      expect(file!.functions[0].line).toBe(5);
      expect(file!.functions[0].hit).toBe(3);

      expect(file!.functions[1].name).toBe("anotherFunction");
      expect(file!.functions[1].line).toBe(10);
      expect(file!.functions[1].hit).toBe(0);

      // Line coverage
      expect(file!.lines[0]).toEqual({ line: 1, hit: 1 });
      expect(file!.lines[1]).toEqual({ line: 2, hit: 0 });
      expect(file!.lines[2]).toEqual({ line: 5, hit: 3 });
      expect(file!.lines[3]).toEqual({ line: 10, hit: 0 });

      // Branch coverage
      expect(file!.branches[0]).toEqual({
        line: 1,
        block: 0,
        branch: 0,
        taken: 1,
      });
      expect(file!.branches[1]).toEqual({
        line: 1,
        block: 0,
        branch: 1,
        taken: 0,
      });

      // Summary
      expect(file!.summary.functionsFound).toBe(2);
      expect(file!.summary.functionsHit).toBe(1);
      expect(file!.summary.linesFound).toBe(4);
      expect(file!.summary.linesHit).toBe(2);
      expect(file!.summary.branchesFound).toBe(2);
      expect(file!.summary.branchesHit).toBe(1);
    });

    it("should parse modern LCOV 2.x FNL/FNA function records", () => {
      const content = `TN:
SF:src/example.ts
FNL:0,5,8
FNA:0,3,myFunction
FNL:1,10,14
FNA:1,0,anotherFunction
FNF:2
FNH:1
DA:5,3
DA:10,0
LF:2
LH:1
end_of_record`;

      const report = LcovParser.parse(content);

      const file = report.files.get("src/example.ts");
      expect(file).toBeDefined();
      expect(file!.functions).toHaveLength(2);

      // Function index 0 maps to the FNL start line (5) with the FNA hit count.
      expect(file!.functions[0].name).toBe("myFunction");
      expect(file!.functions[0].line).toBe(5);
      expect(file!.functions[0].hit).toBe(3);

      expect(file!.functions[1].name).toBe("anotherFunction");
      expect(file!.functions[1].line).toBe(10);
      expect(file!.functions[1].hit).toBe(0);

      expect(file!.summary.functionsFound).toBe(2);
      expect(file!.summary.functionsHit).toBe(1);
    });

    it("should parse aliased FNA records sharing a single FNL location", () => {
      // A single function location may carry several aliased FNA records, each
      // a distinct mangled/templated instantiation sharing the same lines.
      const content = `TN:
SF:src/aliased.ts
FNL:0,16,16
FNA:0,45,talos::AutoFlushedOutput::make_logger_pointer()
FNL:1,21,21
FNA:1,281,talos::ILogOutput::~ILogOutput()
FNA:1,288,talos::ILogOutput::ILogOutput()
FNF:2
FNH:3
DA:16,45
DA:21,569
LF:2
LH:2
end_of_record`;

      const report = LcovParser.parse(content);

      const file = report.files.get("src/aliased.ts");
      expect(file).toBeDefined();
      // Three function names total: one for index 0, two aliases for index 1.
      expect(file!.functions).toHaveLength(3);

      expect(file!.functions[0].name).toBe(
        "talos::AutoFlushedOutput::make_logger_pointer()",
      );
      expect(file!.functions[0].line).toBe(16);
      expect(file!.functions[0].hit).toBe(45);

      // Both aliases inherit the start line of FNL index 1.
      expect(file!.functions[1].line).toBe(21);
      expect(file!.functions[1].hit).toBe(281);
      expect(file!.functions[2].line).toBe(21);
      expect(file!.functions[2].hit).toBe(288);

      expect(file!.summary.functionsFound).toBe(3);
      expect(file!.summary.functionsHit).toBe(3);
    });

    it("should parse multiple files", () => {
      const content = `TN:
SF:src/file1.ts
FN:1,func1
FNF:1
FNH:1
FNDA:1,func1
DA:1,1
LF:1
LH:1
BRF:0
BRH:0
end_of_record
TN:
SF:src/file2.ts
FN:1,func2
FNF:1
FNH:0
FNDA:0,func2
DA:1,0
LF:1
LH:0
BRF:0
BRH:0
end_of_record`;

      const report = LcovParser.parse(content);

      expect(report.files.size).toBe(2);
      expect(report.summary.totalFiles).toBe(2);
      expect(report.summary.functionsFound).toBe(2);
      expect(report.summary.functionsHit).toBe(1);
      expect(report.summary.linesFound).toBe(2);
      expect(report.summary.linesHit).toBe(1);

      const file1 = report.files.get("src/file1.ts");
      expect(file1).toBeDefined();
      expect(file1!.summary.functionsHit).toBe(1);

      const file2 = report.files.get("src/file2.ts");
      expect(file2).toBeDefined();
      expect(file2!.summary.functionsHit).toBe(0);
    });

    it("should handle function names with commas", () => {
      const content = `TN:
SF:src/example.ts
FN:5,myFunction,withCommas
FNF:1
FNH:1
FNDA:1,myFunction,withCommas
DA:5,1
LF:1
LH:1
BRF:0
BRH:0
end_of_record`;

      const report = LcovParser.parse(content);
      const file = report.files.get("src/example.ts");

      expect(file!.functions[0].name).toBe("myFunction,withCommas");
      expect(file!.functions[0].hit).toBe(1);
    });

    it("should handle empty LCOV content", () => {
      const report = LcovParser.parse("");

      expect(report.files.size).toBe(0);
      expect(report.summary.totalFiles).toBe(0);
      expect(report.summary.functionsFound).toBe(0);
      expect(report.summary.linesFound).toBe(0);
      expect(report.summary.branchesFound).toBe(0);
    });

    it("should handle missing end_of_record", () => {
      const content = `TN:
SF:src/example.ts
FN:5,myFunction
FNF:1
FNH:1
FNDA:1,myFunction
DA:5,1
LF:1
LH:1
BRF:0
BRH:0`;

      const report = LcovParser.parse(content);

      expect(report.files.size).toBe(1);
      const file = report.files.get("src/example.ts");
      expect(file).toBeDefined();
      expect(file!.functions[0].name).toBe("myFunction");
    });

    it("should handle branch coverage with dash (no data)", () => {
      const content = `TN:
SF:src/example.ts
DA:1,1
LF:1
LH:1
BRDA:1,0,0,-
BRDA:1,0,1,5
BRF:2
BRH:1
end_of_record`;

      const report = LcovParser.parse(content);
      const file = report.files.get("src/example.ts");

      expect(file!.branches[0].taken).toBe(0);
      expect(file!.branches[1].taken).toBe(5);
      expect(file!.summary.branchesHit).toBe(1);
    });
  });

  // Regression coverage for the LCOV 2.x function record format. Reports
  // produced by lcov 2.x describe functions with FNL/FNA records instead of
  // the legacy FN/FNDA pair. The parser previously only understood the legacy
  // form, so real-world reports silently produced zero functions (and the
  // treemap lost every function name) while the unit suite stayed green. These
  // tests use a representative real-world report shape so that regressing
  // FNL/FNA support — or breaking C++ template name handling — fails loudly.
  describe("LCOV 2.x regression", () => {
    // Mirrors the structure of a real merged C++ report: FNF/FNH summary noise,
    // several files, FNL/FNA with multiple aliases sharing one location index,
    // demangled C++ template names containing commas, and operator names.
    const REAL_WORLD_LCOV_2X = `TN:
SF:src/talos_framework/logger/log_message.cpp
FNF:2
FNH:2
FNL:0,11,14
FNA:0,831,talos::LogMessage::LogMessage()
FNL:1,18,21
FNA:1,6335,talos::LogMessage::LogMessage(std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > const&)
DA:11,831
DA:18,6335
LF:2
LH:2
end_of_record
SF:src/talos_framework/logger/i_log_output.h
FNF:2
FNH:2
FNL:0,16,16
FNA:0,288,talos::ILogOutput::ILogOutput()
FNA:0,281,talos::ILogOutput::~ILogOutput()
FNL:1,21,21
FNA:1,0,talos::ILogOutput::unused()
DA:16,569
DA:21,0
BRDA:16,0,0,5
BRDA:16,0,1,-
LF:2
LH:1
BRF:2
BRH:1
end_of_record
SF:src/talos_video/simulation/net_simulator.cpp
FNF:1
FNH:1
FNL:0,42,57
FNA:0,12,talos_video::simulation::operator<<(std::basic_ostream<char, std::char_traits<char> >&, talos_video::simulation::NetSimulator const&)
DA:42,12
LF:1
LH:1
end_of_record`;

    it("extracts every function with its name, line and hit count", () => {
      const report = LcovParser.parse(REAL_WORLD_LCOV_2X);

      // 2 + 3 (two aliases at index 0) + 1 = 6 functions across 3 files.
      expect(report.summary.totalFiles).toBe(3);
      expect(report.summary.functionsFound).toBe(6);
      expect(report.summary.functionsHit).toBe(5);
    });

    it("preserves commas inside C++ template signatures", () => {
      const report = LcovParser.parse(REAL_WORLD_LCOV_2X);
      const file = report.files.get(
        "src/talos_framework/logger/log_message.cpp",
      );

      const templated = file!.functions[1];
      expect(templated.name).toBe(
        "talos::LogMessage::LogMessage(std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > const&)",
      );
      // The FNA line is taken from the matching FNL location, never 0.
      expect(templated.line).toBe(18);
      expect(templated.hit).toBe(6335);
    });

    it("keeps operator names containing angle brackets intact", () => {
      const report = LcovParser.parse(REAL_WORLD_LCOV_2X);
      const file = report.files.get(
        "src/talos_video/simulation/net_simulator.cpp",
      );

      expect(file!.functions[0].name).toBe(
        "talos_video::simulation::operator<<(std::basic_ostream<char, std::char_traits<char> >&, talos_video::simulation::NetSimulator const&)",
      );
    });

    it("treats aliased FNA records sharing one FNL index as distinct functions", () => {
      const report = LcovParser.parse(REAL_WORLD_LCOV_2X);
      const file = report.files.get(
        "src/talos_framework/logger/i_log_output.h",
      );

      const aliases = file!.functions.filter((f) => f.line === 16);
      expect(aliases.map((f) => f.name)).toEqual([
        "talos::ILogOutput::ILogOutput()",
        "talos::ILogOutput::~ILogOutput()",
      ]);
      expect(aliases.map((f) => f.hit)).toEqual([288, 281]);
    });

    it("never truncates a function name (no unbalanced parentheses)", () => {
      // A truncated name — the failure mode of a naive comma split — would cut
      // a signature mid-argument and leave unbalanced parentheses. Guard the
      // whole report against that class of regression.
      const report = LcovParser.parse(REAL_WORLD_LCOV_2X);

      for (const file of report.files.values()) {
        for (const fn of file.functions) {
          const open = (fn.name.match(/\(/g) ?? []).length;
          const close = (fn.name.match(/\)/g) ?? []).length;
          expect(open).toBe(close);
          // FNA lines are always resolved from their FNL location.
          expect(fn.line).toBeGreaterThan(0);
        }
      }
    });

    it("still parses the legacy FN/FNDA format alongside 2.x support", () => {
      // Locks legacy support so the dispatch table cannot silently drop it.
      const legacy = `TN:
SF:src/legacy.ts
FN:5,legacyFunction
FNDA:7,legacyFunction
DA:5,7
end_of_record`;

      const report = LcovParser.parse(legacy);
      const file = report.files.get("src/legacy.ts");

      expect(file!.functions).toEqual([
        { name: "legacyFunction", line: 5, hit: 7 },
      ]);
    });

    it("ignores coverage records that appear before any SF record", () => {
      // Defensive: a malformed report whose data records precede the first
      // SF must not throw and must produce no files.
      const orphaned = `TN:
FNL:0,1,2
FNA:0,1,orphan
FN:1,legacyOrphan
FNDA:1,legacyOrphan
DA:1,1
BRDA:1,0,0,1
end_of_record`;

      const report = LcovParser.parse(orphaned);

      expect(report.files.size).toBe(0);
      expect(report.summary.totalFiles).toBe(0);
    });

    it("falls back to line 0 when an FNA references an unknown FNL index", () => {
      const content = `TN:
SF:src/example.ts
FNA:9,3,danglingAlias
DA:1,1
end_of_record`;

      const report = LcovParser.parse(content);
      const file = report.files.get("src/example.ts");

      expect(file!.functions).toEqual([
        { name: "danglingAlias", line: 0, hit: 3 },
      ]);
    });
  });
});
