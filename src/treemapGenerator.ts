import * as fs from "fs";
import { CoverageAnalysis } from "./coverageAnalyzer";
import { generateTreemapData } from "./treemapData";
import { TreemapData, TreemapOptions } from "./treemapModel";
import { renderTreemapSvg } from "./treemapRenderer";
import { rasteriseSvgToPng } from "./svgRasteriser";

export type {
  CoverageState,
  TreemapData,
  TreemapFileGroup,
  TreemapNode,
  TreemapOptions,
} from "./treemapModel";

const DEFAULT_OPTIONS: TreemapOptions = {
  width: 1200,
  height: 800,
  outputPath: "./coverage-treemap.png",
  title: "Coverage Treemap",
};

/**
 * Entry point for turning a {@link CoverageAnalysis} into a treemap PNG. The
 * heavy lifting lives in focused modules — {@link generateTreemapData} builds
 * the hierarchy and {@link renderTreemapSvg} draws it — so this class only
 * orchestrates the pipeline: build data, render SVG, rasterise and write.
 */
export class TreemapGenerator {
  /** Build the treemap hierarchy from a coverage analysis. */
  static generateTreemapData(analysis: CoverageAnalysis): TreemapData {
    return generateTreemapData(analysis);
  }

  /** Render the treemap PNG and write it to `outputPath`. */
  static async generatePNG(
    analysis: CoverageAnalysis,
    options: Partial<TreemapOptions> = {},
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const data = generateTreemapData(analysis);
    const svg = renderTreemapSvg(data, opts);

    // Rasterise the SVG to PNG. The font is bundled explicitly so the labels
    // are not dropped by resvg's font-less WASM runtime.
    const buffer = await rasteriseSvgToPng(svg);
    fs.writeFileSync(opts.outputPath, buffer);

    return opts.outputPath;
  }
}
