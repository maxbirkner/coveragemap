import { TreemapGenerator } from "./treemapGenerator";
import { CoverageAnalysis } from "./coverageAnalyzer";
import * as fs from "fs";

// Render with the real d3, d3-hierarchy and linkedom so the SVG drawing path
// (file group boxes + function tiles) actually executes. Only the WASM
// rasteriser and the filesystem write are stubbed so the test stays hermetic.
jest.mock("./svgRasteriser", () => ({
  rasteriseSvgToPng: jest.fn(async () => Buffer.from("fake-png")),
}));

jest.mock("fs");

import { rasteriseSvgToPng } from "./svgRasteriser";

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedRasterise = rasteriseSvgToPng as jest.MockedFunction<
  typeof rasteriseSvgToPng
>;

function fileWithFunctions(
  filePath: string,
  functions: { name: string; line: number; hit: number }[],
  lines: { line: number; hit: number }[],
) {
  const coveredLines = lines.filter((l) => l.hit > 0).length;
  return {
    path: filePath,
    status: "modified" as const,
    coverage: {
      path: filePath,
      functions,
      lines,
      branches: [],
      summary: {
        functionsFound: functions.length,
        functionsHit: functions.filter((f) => f.hit > 0).length,
        linesFound: lines.length,
        linesHit: coveredLines,
        branchesFound: 0,
        branchesHit: 0,
      },
    },
    analysis: {
      totalLines: lines.length,
      coveredLines,
      totalFunctions: functions.length,
      coveredFunctions: functions.filter((f) => f.hit > 0).length,
      totalBranches: 0,
      coveredBranches: 0,
      linesCoveragePercentage: (coveredLines / lines.length) * 100,
      functionsCoveragePercentage: 0,
      branchesCoveragePercentage: 0,
      overallCoveragePercentage: (coveredLines / lines.length) * 100,
    },
  };
}

describe("TreemapGenerator rendering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.writeFileSync.mockImplementation(() => {});
    mockedRasterise.mockResolvedValue(Buffer.from("fake-png"));
  });

  it("draws file group boxes and function tiles into the SVG", async () => {
    const analysis: CoverageAnalysis = {
      changeset: {
        baseCommit: "abc123",
        headCommit: "def456",
        targetBranch: "main",
        files: [],
        totalFiles: 2,
      },
      changedFiles: [
        fileWithFunctions(
          "src/alpha.ts",
          [
            { name: "doWork", line: 1, hit: 3 },
            { name: "helper", line: 40, hit: 0 },
          ],
          Array.from({ length: 80 }, (_, i) => ({
            line: i + 1,
            hit: i < 40 ? 1 : 0,
          })),
        ),
        // File with coverage but no functions -> single file-level tile.
        {
          path: "src/beta.ts",
          status: "modified",
          coverage: {
            path: "src/beta.ts",
            functions: [],
            lines: Array.from({ length: 30 }, (_, i) => ({
              line: i + 1,
              hit: 1,
            })),
            branches: [],
            summary: {
              functionsFound: 0,
              functionsHit: 0,
              linesFound: 30,
              linesHit: 30,
              branchesFound: 0,
              branchesHit: 0,
            },
          },
          analysis: {
            totalLines: 30,
            coveredLines: 30,
            totalFunctions: 0,
            coveredFunctions: 0,
            totalBranches: 0,
            coveredBranches: 0,
            linesCoveragePercentage: 100,
            functionsCoveragePercentage: 0,
            branchesCoveragePercentage: 0,
            overallCoveragePercentage: 100,
          },
        },
        // File without coverage data -> single uncovered tile.
        {
          path: "src/gamma.ts",
          status: "added",
          coverage: undefined,
          analysis: {
            totalLines: 25,
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
      ],
      summary: {
        totalChangedFiles: 3,
        filesWithCoverage: 2,
        filesWithoutCoverage: 1,
        overallCoverage: {
          totalLines: 135,
          coveredLines: 70,
          totalFunctions: 2,
          coveredFunctions: 1,
          totalBranches: 0,
          coveredBranches: 0,
          linesCoveragePercentage: 51.85,
          functionsCoveragePercentage: 50,
          branchesCoveragePercentage: 0,
          overallCoveragePercentage: 51.85,
        },
      },
    };

    await TreemapGenerator.generatePNG(analysis, {
      title: "Coverage Treemap",
      subtitle: "commit def456 · today",
      outputPath: "./out.png",
    });

    expect(mockedRasterise).toHaveBeenCalledTimes(1);
    const svg = mockedRasterise.mock.calls[0][0];

    // File path labels are drawn on the group headers.
    expect(svg).toContain("src/alpha.ts");
    expect(svg).toContain("src/beta.ts");
    expect(svg).toContain("src/gamma.ts");

    // Function names appear on tiles without a file prefix.
    expect(svg).toContain("doWork");
    expect(svg).toContain("helper");

    // Title and subtitle are rendered in the header band.
    expect(svg).toContain("Coverage Treemap");
    expect(svg).toContain("commit def456");

    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      "./out.png",
      expect.any(Buffer),
    );
  });
});
