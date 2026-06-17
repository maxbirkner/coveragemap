import { TreemapGenerator } from "./treemapGenerator";
import { CoverageAnalysis } from "./coverageAnalyzer";
import * as fs from "fs";

// Stub the rasteriser so the facade test stays hermetic; the real SVG drawing
// path is exercised separately in treemapGenerator.render.test.ts.
jest.mock("./svgRasteriser", () => ({
  rasteriseSvgToPng: jest.fn(async () => Buffer.from("fake-png")),
}));

jest.mock("fs");

const mockedFs = fs as jest.Mocked<typeof fs>;

describe("TreemapGenerator.generatePNG", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.writeFileSync.mockImplementation(() => {});
  });

  it("renders the treemap and writes the PNG to the output path", async () => {
    const mockAnalysis: CoverageAnalysis = {
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
          status: "modified",
          coverage: {
            path: "src/example.ts",
            functions: [{ name: "test", line: 1, hit: 1 }],
            lines: [{ line: 1, hit: 1 }],
            branches: [],
            summary: {
              functionsFound: 1,
              functionsHit: 1,
              linesFound: 1,
              linesHit: 1,
              branchesFound: 0,
              branchesHit: 0,
            },
          },
          analysis: {
            totalLines: 1,
            coveredLines: 1,
            totalFunctions: 1,
            coveredFunctions: 1,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 100,
            functionsCoveragePercentage: 100,
            branchesCoveragePercentage: 0,
            overallCoveragePercentage: 100,
          },
        },
      ],
      summary: {
        totalChangedFiles: 1,
        filesWithCoverage: 1,
        filesWithoutCoverage: 0,
        overallCoverage: {
          totalLines: 1,
          coveredLines: 1,
          totalFunctions: 1,
          coveredFunctions: 1,
          totalBranches: 0,
          coveredBranches: 0,
          linesCoveragePercentage: 100,
          functionsCoveragePercentage: 100,
          branchesCoveragePercentage: 0,
          overallCoveragePercentage: 100,
        },
      },
    };

    const result = await TreemapGenerator.generatePNG(mockAnalysis);

    expect(result).toBe("./coverage-treemap.png");
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      "./coverage-treemap.png",
      expect.any(Buffer),
    );
  });
});
