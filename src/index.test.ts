import * as core from "@actions/core";
import {
  getInputs,
  printInputs,
  detectChangeset,
  parseLcovReport,
  analyzeCoverageAndGating,
  postPrComment,
  run,
} from "./index";
import { ChangesetService } from "./changesetService";
import { LcovParser } from "./lcov";
import { CoverageAnalyzer } from "./coverageAnalyzer";
import { PrCommentService } from "./prComment";
import { CoverageGating } from "./coverageGating";

// Mock all the modules
jest.mock("@actions/core");
jest.mock("./changesetService");
jest.mock("./lcov");
jest.mock("./coverageAnalyzer");
jest.mock("./prComment");
jest.mock("./coverageGating");

const mockedCore = core as jest.Mocked<typeof core>;
const mockedChangesetService = ChangesetService as jest.Mocked<
  typeof ChangesetService
>;
const mockedLcovParser = LcovParser as jest.Mocked<typeof LcovParser>;
const mockedCoverageAnalyzer = CoverageAnalyzer as jest.Mocked<
  typeof CoverageAnalyzer
>;
const mockedPrCommentService = PrCommentService as jest.MockedClass<
  typeof PrCommentService
>;
const mockedCoverageGating = CoverageGating as jest.Mocked<
  typeof CoverageGating
>;

describe("getInputs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return inputs when they are provided", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "./foo/bar.info";
      if (name === "coverage-threshold") return "85";
      if (name === "target-branch") return "baz";
      if (name === "github-token") return "test-token";
      if (name === "label") return "test-label";
      if (name === "source-code-pattern") return "src/**/*.ts";
      if (name === "test-code-pattern") return "**/*.test.ts";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "./foo/bar.info",
      coverageThreshold: "85",
      targetBranch: "baz",
      githubToken: "test-token",
      label: "test-label",
      sourceCodePattern: "src/**/*.ts",
      testCodePattern: "**/*.test.ts",
    });
    expect(mockedCore.getInput).toHaveBeenCalledWith("lcov-file");
    expect(mockedCore.getInput).toHaveBeenCalledWith("coverage-threshold");
    expect(mockedCore.getInput).toHaveBeenCalledWith("target-branch");
    expect(mockedCore.getInput).toHaveBeenCalledWith("github-token", {
      required: true,
    });
    expect(mockedCore.getInput).toHaveBeenCalledWith("label");
    expect(mockedCore.getInput).toHaveBeenCalledWith("source-code-pattern");
    expect(mockedCore.getInput).toHaveBeenCalledWith("test-code-pattern");
  });

  it("should return default values when inputs are not provided", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: undefined,
      testCodePattern: undefined,
    });
  });

  it("should handle partial inputs correctly", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "./test/lcov.info";
      if (name === "coverage-threshold") return "";
      if (name === "target-branch") return "develop";
      if (name === "github-token") return "test-token";
      if (name === "label") return "";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "./test/lcov.info",
      coverageThreshold: "80",
      targetBranch: "develop",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: undefined,
      testCodePattern: undefined,
    });
  });

  it("should handle empty string inputs by using defaults", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "";
      if (name === "coverage-threshold") return "";
      if (name === "target-branch") return "";
      if (name === "github-token") return "test-token";
      if (name === "label") return "";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: undefined,
      testCodePattern: undefined,
    });
  });

  it("should handle custom target branch", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "coverage/lcov.info";
      if (name === "coverage-threshold") return "90";
      if (name === "target-branch") return "develop";
      if (name === "github-token") return "test-token";
      if (name === "label") return "";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "90",
      targetBranch: "develop",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: undefined,
      testCodePattern: undefined,
    });
  });

  it("should handle source code and test patterns", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      if (name === "source-code-pattern") return "src/**/*.ts,lib/**/*.js";
      if (name === "test-code-pattern") return "**/*.test.*,**/*.spec.*";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: "src/**/*.ts,lib/**/*.js",
      testCodePattern: "**/*.test.*,**/*.spec.*",
    });
  });

  it("should handle mixed pattern and empty inputs", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      if (name === "source-code-pattern") return "app/**/*.py";
      if (name === "test-code-pattern") return "";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: "app/**/*.py",
      testCodePattern: undefined,
    });
  });
});

describe("printInputs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should print all inputs", () => {
    const inputs = {
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "test-token",
      label: "coverage",
      sourceCodePattern: "src/**/*.ts",
      testCodePattern: "**/*.test.ts",
    };

    printInputs(inputs);

    expect(mockedCore.info).toHaveBeenCalledWith(
      "📁 LCOV file: coverage/lcov.info",
    );
    expect(mockedCore.info).toHaveBeenCalledWith("📊 Coverage threshold: 80%");
    expect(mockedCore.info).toHaveBeenCalledWith("🌿 Target branch: main");
    expect(mockedCore.info).toHaveBeenCalledWith("🔑 GitHub token: [PROVIDED]");
    expect(mockedCore.info).toHaveBeenCalledWith("🏷️ Label: coverage");
    expect(mockedCore.info).toHaveBeenCalledWith(
      "📂 Source code pattern: src/**/*.ts",
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      "🧪 Test code pattern: **/*.test.ts",
    );
  });

  it("should print minimal inputs without optional fields", () => {
    const inputs = {
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "test-token",
    };

    printInputs(inputs);

    expect(mockedCore.info).toHaveBeenCalledWith(
      "📁 LCOV file: coverage/lcov.info",
    );
    expect(mockedCore.info).toHaveBeenCalledWith("📊 Coverage threshold: 80%");
    expect(mockedCore.info).toHaveBeenCalledWith("🌿 Target branch: main");
    expect(mockedCore.info).toHaveBeenCalledWith("🔑 GitHub token: [PROVIDED]");
    expect(mockedCore.info).not.toHaveBeenCalledWith(
      expect.stringContaining("🏷️ Label:"),
    );
    expect(mockedCore.info).not.toHaveBeenCalledWith(
      expect.stringContaining("📂 Source code pattern:"),
    );
    expect(mockedCore.info).not.toHaveBeenCalledWith(
      expect.stringContaining("🧪 Test code pattern:"),
    );
  });

  it("should handle missing github token", () => {
    const inputs = {
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "",
    };

    printInputs(inputs);

    expect(mockedCore.info).toHaveBeenCalledWith("🔑 GitHub token: [MISSING]");
  });
});

describe("detectChangeset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should detect changeset with patterns", async () => {
    const mockChangeset = {
      baseCommit: "abc123",
      headCommit: "def456",
      targetBranch: "main",
      files: [
        { path: "file1.ts", status: "modified" as const },
        { path: "file2.ts", status: "added" as const },
      ],
      totalFiles: 2,
    };
    mockedChangesetService.detectCodeChanges.mockResolvedValue(mockChangeset);
    mockedChangesetService.outputChangeset.mockImplementation();

    const result = await detectChangeset("main", "src/**/*.ts", "**/*.test.ts");

    expect(mockedCore.startGroup).toHaveBeenCalledWith(
      "🕵️‍♂️ Determining changeset",
    );
    expect(mockedChangesetService.detectCodeChanges).toHaveBeenCalledWith(
      "main",
      undefined,
      "src/**/*.ts",
      "**/*.test.ts",
    );
    expect(mockedChangesetService.outputChangeset).toHaveBeenCalledWith(
      mockChangeset,
    );
    expect(mockedCore.endGroup).toHaveBeenCalled();
    expect(result).toBe(mockChangeset);
  });

  it("should detect changeset without patterns", async () => {
    const mockChangeset = {
      baseCommit: "abc123",
      headCommit: "def456",
      targetBranch: "develop",
      files: [{ path: "file1.ts", status: "modified" as const }],
      totalFiles: 1,
    };
    mockedChangesetService.detectCodeChanges.mockResolvedValue(mockChangeset);

    const result = await detectChangeset("develop");

    expect(mockedChangesetService.detectCodeChanges).toHaveBeenCalledWith(
      "develop",
      undefined,
      undefined,
      undefined,
    );
    expect(result).toBe(mockChangeset);
  });
});

describe("parseLcovReport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should parse LCOV report successfully", async () => {
    const mockReport = {
      files: new Map(),
      summary: {
        totalFiles: 5,
        linesFound: 100,
        linesHit: 80,
        functionsFound: 20,
        functionsHit: 18,
        branchesFound: 10,
        branchesHit: 8,
      },
    };
    mockedLcovParser.parseFile.mockReturnValue(mockReport);

    const result = await parseLcovReport("coverage/lcov.info");

    expect(mockedCore.startGroup).toHaveBeenCalledWith(
      "📊 Parsing LCOV report",
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      "📂 Reading LCOV file: coverage/lcov.info",
    );
    expect(mockedLcovParser.parseFile).toHaveBeenCalledWith(
      "coverage/lcov.info",
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      "✅ Parsed 5 files from LCOV report",
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      "📈 Overall coverage: 80/100 lines, 18/20 functions",
    );
    expect(mockedCore.endGroup).toHaveBeenCalled();
    expect(result).toBe(mockReport);
  });
});

describe("analyzeCoverageAndGating", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should analyze coverage and evaluate gating", async () => {
    const mockChangeset = {
      baseCommit: "abc123",
      headCommit: "def456",
      targetBranch: "main",
      files: [{ path: "file1.ts", status: "modified" as const }],
      totalFiles: 1,
    };
    const mockLcovReport = {
      files: new Map(),
      summary: {
        totalFiles: 5,
        linesFound: 100,
        linesHit: 80,
        functionsFound: 20,
        functionsHit: 18,
        branchesFound: 10,
        branchesHit: 8,
      },
    };
    const mockAnalysis = {
      changeset: mockChangeset,
      changedFiles: [],
      summary: {
        totalChangedFiles: 1,
        filesWithCoverage: 1,
        filesWithoutCoverage: 0,
        overallCoverage: {
          overallCoveragePercentage: 85.5,
          totalLines: 100,
          coveredLines: 85,
          totalFunctions: 20,
          coveredFunctions: 18,
          totalBranches: 10,
          coveredBranches: 8,
          linesCoveragePercentage: 85.0,
          functionsCoveragePercentage: 90.0,
          branchesCoveragePercentage: 80.0,
        },
      },
    };
    const mockGatingResult = {
      meetsThreshold: true,
      threshold: 80,
      mode: "standard" as const,
      prCoveragePercentage: 85.5,
      description: "Coverage meets threshold",
      errorMessage: undefined,
    };

    mockedCoverageAnalyzer.analyze.mockReturnValue(mockAnalysis);
    mockedCoverageAnalyzer.format.mockReturnValue("Analysis formatted");
    mockedCoverageGating.evaluate.mockReturnValue(mockGatingResult);
    mockedCoverageGating.format.mockReturnValue("Gating formatted");

    const result = await analyzeCoverageAndGating(
      mockChangeset,
      mockLcovReport,
      80,
    );

    expect(mockedCore.startGroup).toHaveBeenCalledWith(
      "🔍 Analyzing coverage for changed files",
    );
    expect(mockedCoverageAnalyzer.analyze).toHaveBeenCalledWith(
      mockChangeset,
      mockLcovReport,
    );
    expect(mockedCore.info).toHaveBeenCalledWith("Analysis formatted");
    expect(mockedCoverageGating.evaluate).toHaveBeenCalledWith(
      mockAnalysis,
      mockLcovReport,
      80,
    );
    expect(mockedCore.info).toHaveBeenCalledWith("Gating formatted");
    expect(mockedCore.setOutput).toHaveBeenCalledWith(
      "coverage-percentage",
      85.5,
    );
    expect(mockedCore.setOutput).toHaveBeenCalledWith("meets-threshold", true);
    expect(mockedCore.setOutput).toHaveBeenCalledWith("files-analyzed", 1);
    expect(mockedCore.setOutput).toHaveBeenCalledWith("files-with-coverage", 1);
    expect(mockedCore.endGroup).toHaveBeenCalled();
    expect(result).toEqual({
      analysis: mockAnalysis,
      gatingResult: mockGatingResult,
    });
  });
});

describe("postPrComment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should post PR comment successfully", async () => {
    const mockAnalysis = {
      changeset: {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [],
        totalFiles: 0,
      },
      changedFiles: [],
      summary: {
        totalChangedFiles: 1,
        filesWithCoverage: 1,
        filesWithoutCoverage: 0,
        overallCoverage: {
          overallCoveragePercentage: 85.5,
          totalLines: 100,
          coveredLines: 85,
          totalFunctions: 20,
          coveredFunctions: 18,
          totalBranches: 10,
          coveredBranches: 8,
          linesCoveragePercentage: 85.0,
          functionsCoveragePercentage: 90.0,
          branchesCoveragePercentage: 80.0,
        },
      },
    };
    const mockLcovReport = {
      files: new Map(),
      summary: {
        totalFiles: 5,
        linesFound: 100,
        linesHit: 80,
        functionsFound: 20,
        functionsHit: 18,
        branchesFound: 10,
        branchesHit: 8,
      },
    };
    const mockGatingResult = {
      meetsThreshold: true,
      threshold: 80,
      mode: "standard" as const,
      prCoveragePercentage: 85.5,
      description: "Coverage meets threshold",
    };
    const mockCommentService = {
      postComment: jest.fn().mockResolvedValue(undefined),
    };
    mockedPrCommentService.mockImplementation(() => mockCommentService as any);

    await postPrComment(
      mockAnalysis,
      mockLcovReport,
      mockGatingResult,
      "test-token",
      "coverage",
    );

    expect(mockedCore.startGroup).toHaveBeenCalledWith("💬 Posting PR comment");
    expect(mockedPrCommentService).toHaveBeenCalledWith({
      githubToken: "test-token",
      label: "coverage",
    });
    expect(mockCommentService.postComment).toHaveBeenCalledWith(
      mockAnalysis,
      mockLcovReport,
      mockGatingResult,
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      "✅ PR comment posted successfully",
    );
    expect(mockedCore.endGroup).toHaveBeenCalled();
  });

  it("should handle PR comment posting failure", async () => {
    const mockAnalysis = {
      changeset: {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [],
        totalFiles: 0,
      },
      changedFiles: [],
      summary: {
        totalChangedFiles: 1,
        filesWithCoverage: 1,
        filesWithoutCoverage: 0,
        overallCoverage: {
          overallCoveragePercentage: 85.5,
          totalLines: 100,
          coveredLines: 85,
          totalFunctions: 20,
          coveredFunctions: 18,
          totalBranches: 10,
          coveredBranches: 8,
          linesCoveragePercentage: 85.0,
          functionsCoveragePercentage: 90.0,
          branchesCoveragePercentage: 80.0,
        },
      },
    };
    const mockLcovReport = {
      files: new Map(),
      summary: {
        totalFiles: 5,
        linesFound: 100,
        linesHit: 80,
        functionsFound: 20,
        functionsHit: 18,
        branchesFound: 10,
        branchesHit: 8,
      },
    };
    const mockGatingResult = {
      meetsThreshold: true,
      threshold: 80,
      mode: "standard" as const,
      prCoveragePercentage: 85.5,
      description: "Coverage meets threshold",
    };
    const mockCommentService = {
      postComment: jest.fn().mockRejectedValue(new Error("API Error")),
    };
    mockedPrCommentService.mockImplementation(() => mockCommentService as any);

    await postPrComment(
      mockAnalysis,
      mockLcovReport,
      mockGatingResult,
      "test-token",
    );

    expect(mockedCore.warning).toHaveBeenCalledWith(
      "Failed to post PR comment: API Error",
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      "🔍 This might be because the action is not running in a PR context or lacks permissions",
    );
  });

  it("should handle non-Error exceptions", async () => {
    const mockAnalysis = {
      changeset: {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [],
        totalFiles: 0,
      },
      changedFiles: [],
      summary: {
        totalChangedFiles: 1,
        filesWithCoverage: 1,
        filesWithoutCoverage: 0,
        overallCoverage: {
          overallCoveragePercentage: 85.5,
          totalLines: 100,
          coveredLines: 85,
          totalFunctions: 20,
          coveredFunctions: 18,
          totalBranches: 10,
          coveredBranches: 8,
          linesCoveragePercentage: 85.0,
          functionsCoveragePercentage: 90.0,
          branchesCoveragePercentage: 80.0,
        },
      },
    };
    const mockLcovReport = {
      files: new Map(),
      summary: {
        totalFiles: 5,
        linesFound: 100,
        linesHit: 80,
        functionsFound: 20,
        functionsHit: 18,
        branchesFound: 10,
        branchesHit: 8,
      },
    };
    const mockGatingResult = {
      meetsThreshold: true,
      threshold: 80,
      mode: "standard" as const,
      prCoveragePercentage: 85.5,
      description: "Coverage meets threshold",
    };
    const mockCommentService = {
      postComment: jest.fn().mockRejectedValue("String error"),
    };
    mockedPrCommentService.mockImplementation(() => mockCommentService as any);

    await postPrComment(
      mockAnalysis,
      mockLcovReport,
      mockGatingResult,
      "test-token",
    );

    expect(mockedCore.warning).toHaveBeenCalledWith(
      "Failed to post PR comment: String error",
    );
  });
});

describe("run", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock getInputs
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      if (name === "lcov-file") return "coverage/lcov.info";
      if (name === "coverage-threshold") return "80";
      if (name === "target-branch") return "main";
      return "";
    });

    // Mock all the async functions
    const mockChangeset = {
      baseCommit: "abc123",
      headCommit: "def456",
      targetBranch: "main",
      files: [{ path: "file1.ts", status: "modified" as const }],
      totalFiles: 1,
    };
    const mockLcovReport = {
      files: new Map(),
      summary: {
        totalFiles: 5,
        linesFound: 100,
        linesHit: 80,
        functionsFound: 20,
        functionsHit: 18,
        branchesFound: 10,
        branchesHit: 8,
      },
    };
    const mockAnalysis = {
      changeset: mockChangeset,
      changedFiles: [],
      summary: {
        totalChangedFiles: 1,
        filesWithCoverage: 1,
        filesWithoutCoverage: 0,
        overallCoverage: {
          overallCoveragePercentage: 85.5,
          totalLines: 100,
          coveredLines: 85,
          totalFunctions: 20,
          coveredFunctions: 18,
          totalBranches: 10,
          coveredBranches: 8,
          linesCoveragePercentage: 85.0,
          functionsCoveragePercentage: 90.0,
          branchesCoveragePercentage: 80.0,
        },
      },
    };
    const mockGatingResult = {
      meetsThreshold: true,
      threshold: 80,
      mode: "standard" as const,
      prCoveragePercentage: 85.5,
      description: "Coverage meets threshold",
      errorMessage: undefined,
    };

    mockedChangesetService.detectCodeChanges.mockResolvedValue(mockChangeset);
    mockedChangesetService.outputChangeset.mockImplementation();
    mockedLcovParser.parseFile.mockReturnValue(mockLcovReport);
    mockedCoverageAnalyzer.analyze.mockReturnValue(mockAnalysis);
    mockedCoverageAnalyzer.format.mockReturnValue("Analysis formatted");
    mockedCoverageGating.evaluate.mockReturnValue(mockGatingResult);
    mockedCoverageGating.format.mockReturnValue("Gating formatted");

    const mockCommentService = {
      postComment: jest.fn().mockResolvedValue(undefined),
    };
    mockedPrCommentService.mockImplementation(() => mockCommentService as any);
  });

  it("should run successfully when threshold is met", async () => {
    await run();

    expect(mockedCore.info).toHaveBeenCalledWith(
      "✅ Coverage Treemap Action completed successfully!",
    );
    expect(mockedCore.setFailed).not.toHaveBeenCalled();
  });

  it("should fail when threshold is not met", async () => {
    const mockGatingResult = {
      meetsThreshold: false,
      threshold: 80,
      mode: "standard" as const,
      prCoveragePercentage: 75,
      description: "Coverage below threshold",
      errorMessage: "Coverage 75% is below threshold 80%",
    };
    mockedCoverageGating.evaluate.mockReturnValue(mockGatingResult);

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      "Coverage 75% is below threshold 80%",
    );
    expect(mockedCore.info).not.toHaveBeenCalledWith(
      "✅ Coverage Treemap Action completed successfully!",
    );
  });

  it("should handle exceptions gracefully", async () => {
    mockedChangesetService.detectCodeChanges.mockRejectedValue(
      new Error("Git error"),
    );

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith("Git error");
  });

  it("should handle non-Error exceptions", async () => {
    mockedLcovParser.parseFile.mockImplementation(() => {
      throw "String error";
    });

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith("String error");
  });
});
