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
});
