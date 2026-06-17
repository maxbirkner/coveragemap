// Mock D3.js modules before imports
jest.mock("d3", () => ({
  scaleOrdinal: jest.fn(() => ({
    domain: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
  })),
  schemeCategory10: ["#1f77b4", "#ff7f0e", "#2ca02c"],
  select: jest.fn(() => ({
    append: jest.fn().mockReturnThis(),
    attr: jest.fn().mockReturnThis(),
    style: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
  })),
}));

jest.mock("d3-hierarchy", () => ({
  hierarchy: jest.fn(() => ({
    sum: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
  })),
  treemap: jest.fn(() => ({
    size: jest.fn().mockReturnThis(),
    padding: jest.fn().mockReturnThis(),
  })),
}));

// Mock the resvg WASM renderer
jest.mock("@resvg/resvg-wasm", () => ({
  initWasm: jest.fn().mockResolvedValue(undefined),
  Resvg: jest.fn().mockImplementation(() => ({
    render: jest.fn(() => ({
      asPng: jest.fn(() => Buffer.from("fake-png-data")),
    })),
  })),
}));

// Mock linkedom
jest.mock("linkedom", () => ({
  parseHTML: jest.fn(() => ({
    document: {
      createElement: jest.fn(() => ({
        setAttribute: jest.fn(),
      })),
    },
  })),
}));

import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  detectChangeset,
  parseLcovReport,
  analyzeCoverageAndGating,
  postPrComment,
  generateAndUploadTreemap,
  buildTreemapSubtitle,
} from "./pipeline";
import { ChangesetService } from "./changesetService";
import { LcovParser } from "./lcov";
import { CoverageAnalyzer } from "./coverageAnalyzer";
import { PrCommentService } from "./prComment";
import { CoverageGating } from "./coverageGating";
import { ArtifactService } from "./artifactService";

// Mock all the modules
jest.mock("@actions/core");
jest.mock("./changesetService");
jest.mock("./lcov");
jest.mock("./coverageAnalyzer");
jest.mock("./prComment");
jest.mock("./coverageGating");
jest.mock("./treemapGenerator");
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
// Mock TreemapGenerator
jest.mock("./treemapGenerator", () => ({
  TreemapGenerator: {
    generatePNG: jest.fn(),
  },
}));
const mockedTreemapGenerator = require("./treemapGenerator").TreemapGenerator;
const mockedArtifactService = ArtifactService as jest.MockedClass<
  typeof ArtifactService
>;

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
    const commentUrl = "https://github.com/test/repo/pull/123#issuecomment-456";
    const mockCommentService = {
      postComment: jest.fn().mockResolvedValue(commentUrl),
    };
    mockedPrCommentService.mockImplementation(() => mockCommentService as any);

    await postPrComment(
      mockAnalysis,
      mockLcovReport,
      mockGatingResult,
      "test-token",
      "coverage",
      undefined,
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
      undefined,
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      "✅ PR comment posted successfully",
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      `💬 View PR comment: ${commentUrl}`,
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

describe("generateAndUploadTreemap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_REF = "refs/pull/123/merge";
    process.env.GITHUB_REPOSITORY = "owner/repo";
    process.env.GITHUB_RUN_ID = "456789";
  });

  it("should generate and upload treemap successfully", async () => {
    const mockAnalysis = {
      changeset: {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [],
        totalFiles: 1,
      },
      changedFiles: [
        {
          path: "src/example.ts",
          status: "modified" as const,
          coverage: {
            path: "src/example.ts",
            functions: [],
            lines: [],
            branches: [],
            summary: {
              functionsFound: 10,
              functionsHit: 8,
              linesFound: 100,
              linesHit: 80,
              branchesFound: 20,
              branchesHit: 16,
            },
          },
          analysis: {
            totalLines: 100,
            coveredLines: 80,
            totalFunctions: 10,
            coveredFunctions: 8,
            totalBranches: 20,
            coveredBranches: 16,
            linesCoveragePercentage: 80,
            functionsCoveragePercentage: 80,
            branchesCoveragePercentage: 80,
            overallCoveragePercentage: 80,
          },
        },
      ],
      summary: {
        totalChangedFiles: 1,
        filesWithCoverage: 1,
        filesWithoutCoverage: 0,
        overallCoverage: {
          totalLines: 100,
          coveredLines: 80,
          totalFunctions: 10,
          coveredFunctions: 8,
          totalBranches: 20,
          coveredBranches: 16,
          linesCoveragePercentage: 80,
          functionsCoveragePercentage: 80,
          branchesCoveragePercentage: 80,
          overallCoveragePercentage: 80,
        },
      },
    };

    // Mock TreemapGenerator static method
    mockedTreemapGenerator.generatePNG.mockResolvedValue(
      "./coverage-treemap.png",
    );

    const mockArtifactServiceInstance = {
      uploadArtifact: jest.fn().mockResolvedValue({
        name: "coverage-treemap-pr-123",
        path: "./coverage-treemap.png",
        size: 1024,
        downloadUrl:
          "https://github.com/owner/repo/actions/runs/123/artifacts/456",
      }),
      generateTreemapArtifactName: jest
        .fn()
        .mockReturnValue("coverage-treemap-pr-123"),
      cleanupTempFiles: jest.fn(),
    };

    (mockedArtifactService as any).mockImplementation(
      () => mockArtifactServiceInstance,
    );

    const result = await generateAndUploadTreemap(mockAnalysis);

    expect(mockedTreemapGenerator.generatePNG).toHaveBeenCalledWith(
      mockAnalysis,
      {
        width: 1200,
        height: 800,
        outputPath: "./coverage-treemap.png",
        title: "Coverage Treemap",
        subtitle: expect.stringContaining("commit "),
      },
    );
    expect(mockArtifactServiceInstance.uploadArtifact).toHaveBeenCalledWith(
      "coverage-treemap-pr-123",
      "./coverage-treemap.png",
      30,
    );
    expect(result).toEqual({
      name: "coverage-treemap-pr-123",
      path: "./coverage-treemap.png",
      size: 1024,
      downloadUrl:
        "https://github.com/owner/repo/actions/runs/123/artifacts/456",
    });
  });

  it("should forward a custom treemap title", async () => {
    mockedTreemapGenerator.generatePNG.mockResolvedValue(
      "./coverage-treemap.png",
    );

    const mockArtifactServiceInstance = {
      uploadArtifact: jest.fn().mockResolvedValue({
        name: "coverage-treemap-pr-123",
        path: "./coverage-treemap.png",
        size: 1024,
        downloadUrl: "https://example.com",
      }),
      cleanupTempFiles: jest.fn().mockResolvedValue(undefined),
      generateTreemapArtifactName: jest
        .fn()
        .mockReturnValue("coverage-treemap-pr-123"),
    };
    mockedArtifactService.mockImplementation(
      () => mockArtifactServiceInstance as unknown as ArtifactService,
    );

    const mockAnalysis = {
      changedFiles: [{ path: "src/example.ts", coverage: {} }],
    } as unknown as Parameters<typeof generateAndUploadTreemap>[0];

    await generateAndUploadTreemap(mockAnalysis, "My Custom Title");

    expect(mockedTreemapGenerator.generatePNG).toHaveBeenCalledWith(
      mockAnalysis,
      expect.objectContaining({ title: "My Custom Title" }),
    );
  });

  it("should handle treemap generation failure gracefully", async () => {
    // Mock TreemapGenerator.generatePNG to throw an error
    mockedTreemapGenerator.generatePNG.mockRejectedValue(
      new Error("D3.js not available"),
    );

    const mockAnalysis = {
      changeset: {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [],
        totalFiles: 0,
      },
      changedFiles: [
        {
          path: "src/example.ts",
          status: "modified" as const,
          coverage: {
            path: "src/example.ts",
            functions: [],
            lines: [],
            branches: [],
            summary: {
              functionsFound: 10,
              functionsHit: 8,
              linesFound: 100,
              linesHit: 80,
              branchesFound: 20,
              branchesHit: 16,
            },
          },
          analysis: {
            totalLines: 100,
            coveredLines: 80,
            totalFunctions: 10,
            coveredFunctions: 8,
            totalBranches: 20,
            coveredBranches: 16,
            linesCoveragePercentage: 80,
            functionsCoveragePercentage: 80,
            branchesCoveragePercentage: 80,
            overallCoveragePercentage: 80,
          },
        },
      ],
      summary: {
        totalChangedFiles: 0,
        filesWithCoverage: 0,
        filesWithoutCoverage: 0,
        overallCoverage: {
          totalLines: 0,
          coveredLines: 0,
          totalFunctions: 0,
          coveredFunctions: 0,
          totalBranches: 0,
          coveredBranches: 0,
          linesCoveragePercentage: 0,
          functionsCoveragePercentage: 0,
          branchesCoveragePercentage: 0,
          overallCoveragePercentage: 0,
        },
      },
    };

    const result = await generateAndUploadTreemap(mockAnalysis);

    expect(result).toBeNull();
    expect(mockedCore.warning).toHaveBeenCalledWith(
      "Failed to generate treemap: D3.js not available",
    );
  });
});

describe("buildTreemapSubtitle", () => {
  const originalSha = process.env.GITHUB_SHA;

  afterEach(() => {
    if (originalSha === undefined) {
      delete process.env.GITHUB_SHA;
    } else {
      process.env.GITHUB_SHA = originalSha;
    }
    github.context.payload = {};
  });

  it("prefers the pull request head sha", () => {
    github.context.payload = {
      pull_request: { head: { sha: "abcdef1234567890" } },
    } as unknown as typeof github.context.payload;

    const subtitle = buildTreemapSubtitle();

    expect(subtitle).toMatch(/^commit abcdef1 · generated .+ UTC$/);
  });

  it("falls back to GITHUB_SHA", () => {
    github.context.payload = {};
    process.env.GITHUB_SHA = "1234567abcdef";

    expect(buildTreemapSubtitle()).toMatch(/^commit 1234567 /);
  });

  it("uses 'unknown' when no sha is available", () => {
    github.context.payload = {};
    delete process.env.GITHUB_SHA;

    expect(buildTreemapSubtitle()).toMatch(/^commit unknown /);
  });
});
