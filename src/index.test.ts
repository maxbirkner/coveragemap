import * as core from "@actions/core";
import { run } from "./index";
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
jest.mock("./treemap/treemapGenerator");
jest.mock("./artifactService");

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

  it("should fail with fallback message when threshold is not met and errorMessage is undefined", async () => {
    const mockGatingResult = {
      meetsThreshold: false,
      threshold: 80,
      mode: "standard" as const,
      prCoveragePercentage: 75,
      description: "Coverage below threshold",
      errorMessage: undefined,
    };
    mockedCoverageGating.evaluate.mockReturnValue(mockGatingResult);

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      "Coverage threshold not met.",
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
