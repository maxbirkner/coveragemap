import * as fs from "fs";
import * as path from "path";
import { parseHTML } from "linkedom";
import * as d3 from "d3";
import { hierarchy, treemap, HierarchyRectangularNode } from "d3-hierarchy";
import { CoverageAnalysis } from "./coverageAnalyzer";
import { FunctionCoverage, FileCoverage } from "./lcov";
import { rasteriseSvgToPng } from "./svgRasteriser";

export interface TreemapNode {
  name: string;
  file: string;
  value: number; // line count
  coverage: "full" | "partial" | "none";
  lineCount: number;
  coveredLines: number;
  functionName?: string;
}

export interface TreemapData {
  name: string;
  children: TreemapNode[];
}

export interface TreemapOptions {
  width: number;
  height: number;
  outputPath: string;
  title: string;
  /** Optional second line under the title, e.g. commit hash and date. */
  subtitle?: string;
}

export class TreemapGenerator {
  private static readonly DEFAULT_OPTIONS: TreemapOptions = {
    width: 1200,
    height: 800,
    outputPath: "./coverage-treemap.png",
    title: "Coverage Treemap",
  };

  // Palette sourced from the "1A535C / 4ECDC4 / F7FFF7 / FF6B6B / FFE66D"
  // scheme: deep teal anchors the text, with teal/yellow/coral encoding the
  // coverage states against a soft mint background.
  private static readonly COLORS = {
    full: "#4ecdc4", // Teal for full coverage
    partial: "#ffe66d", // Yellow for partial coverage
    none: "#ff6b6b", // Coral for no coverage
    background: "#f7fff7", // Soft mint
    border: "#1a535c", // Deep teal
    text: "#1a535c", // Deep teal
    subtitle: "#4a7a82", // Muted teal
  };

  private static readonly PIXELS_PER_CHAR = 7;
  private static readonly ELLIPSIS_LENGTH = 3;
  private static readonly MIN_FUNCTION_SIZE_ESTIMATE = 10;
  private static readonly DEFAULT_FUNCTION_LINE_COUNT = 10;

  // Vertical space reserved at the top for the title, subtitle and legend so
  // none of them overlap the coverage tiles below.
  private static readonly HEADER_HEIGHT = 70;
  private static readonly SIDE_MARGIN = 20;
  private static readonly BOTTOM_MARGIN = 20;

  /**
   * Generate treemap data from coverage analysis
   */
  static generateTreemapData(analysis: CoverageAnalysis): TreemapData {
    const children: TreemapNode[] = [];

    for (const file of analysis.changedFiles) {
      if (!file.coverage) {
        // File without coverage data - treat as uncovered
        children.push({
          name: path.basename(file.path),
          file: file.path,
          value: Math.max(file.analysis.totalLines, 1), // Ensure minimum size
          coverage: "none",
          lineCount: file.analysis.totalLines,
          coveredLines: 0,
        });
        continue;
      }

      // Process functions in the file
      if (file.coverage.functions.length > 0) {
        for (const func of file.coverage.functions) {
          const functionLines = this.getFunctionLineCount(func, file.coverage);
          const coveredLines = this.getFunctionCoveredLines(
            func,
            file.coverage,
          );

          let coverage: "full" | "partial" | "none";
          if (coveredLines === 0) {
            coverage = "none";
          } else if (coveredLines === functionLines) {
            coverage = "full";
          } else {
            coverage = "partial";
          }

          children.push({
            name: `${path.basename(file.path)}::${func.name}`,
            file: file.path,
            value: Math.max(functionLines, 1), // Ensure minimum size
            coverage,
            lineCount: functionLines,
            coveredLines,
            functionName: func.name,
          });
        }
      } else {
        // File has coverage but no functions - treat as file-level coverage
        const coverageRatio = file.analysis.linesCoveragePercentage / 100;
        let coverage: "full" | "partial" | "none";
        if (coverageRatio === 0) {
          coverage = "none";
        } else if (coverageRatio === 1) {
          coverage = "full";
        } else {
          coverage = "partial";
        }

        children.push({
          name: path.basename(file.path),
          file: file.path,
          value: Math.max(file.analysis.totalLines, 1),
          coverage,
          lineCount: file.analysis.totalLines,
          coveredLines: file.analysis.coveredLines,
        });
      }
    }

    return {
      name: "Coverage Analysis",
      children,
    };
  }

  /**
   * Generate PNG treemap visualization
   */
  static async generatePNG(
    analysis: CoverageAnalysis,
    options: Partial<TreemapOptions> = {},
  ): Promise<string> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const data = this.generateTreemapData(analysis);

    // Create a virtual DOM environment for D3. linkedom is a lightweight,
    // self-contained DOM implementation that bundles cleanly to a single ESM
    // file (unlike jsdom, which loads on-disk assets at runtime). D3's
    // selection API operates on the document node passed to it, so no global
    // document/window patching is required.
    const { document } = parseHTML(`<!DOCTYPE html><html><body></body></html>`);

    // Create SVG element
    const svg = d3
      .select(document.body)
      .append("svg")
      .attr("width", opts.width)
      .attr("height", opts.height)
      .attr("xmlns", "http://www.w3.org/2000/svg");

    // Add background
    svg
      .append("rect")
      .attr("width", opts.width)
      .attr("height", opts.height)
      .attr("fill", this.COLORS.background);

    // Create D3 treemap layout
    const root = hierarchy<TreemapData | TreemapNode>(data)
      .sum((d) => (d as TreemapNode).value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const treemapLayout = treemap<TreemapData | TreemapNode>()
      .size([
        opts.width - this.SIDE_MARGIN * 2,
        opts.height - (this.HEADER_HEIGHT + this.BOTTOM_MARGIN),
      ])
      .padding(2);

    treemapLayout(root);

    // Draw title (left-aligned in the reserved header band)
    svg
      .append("text")
      .attr("x", this.SIDE_MARGIN)
      .attr("y", 35)
      .attr("text-anchor", "start")
      .attr("font-family", "Arial, sans-serif")
      .attr("font-size", "24px")
      .attr("fill", this.COLORS.text)
      .text(opts.title);

    // Draw subtitle (commit hash, generation date) under the title
    if (opts.subtitle) {
      svg
        .append("text")
        .attr("x", this.SIDE_MARGIN)
        .attr("y", 56)
        .attr("text-anchor", "start")
        .attr("font-family", "Arial, sans-serif")
        .attr("font-size", "12px")
        .attr("fill", this.COLORS.subtitle)
        .text(opts.subtitle);
    }

    // Draw the legend on the same line as the title, aligned to the right
    // edge. It lives in the reserved header band so it never overlaps tiles.
    this.drawSVGLegend(svg, opts.width - this.SIDE_MARGIN, 35);

    // Draw treemap rectangles
    const leaves = root.leaves();
    const leafGroup = svg.append("g").attr("class", "leaves");

    for (const leaf of leaves as HierarchyRectangularNode<
      TreemapData | TreemapNode
    >[]) {
      if (
        leaf.x0 === undefined ||
        leaf.y0 === undefined ||
        leaf.x1 === undefined ||
        leaf.y1 === undefined
      )
        continue;

      const node = leaf.data as TreemapNode;
      const x = leaf.x0 + this.SIDE_MARGIN; // Account for side margin
      const y = leaf.y0 + this.HEADER_HEIGHT; // Account for header band
      const width = leaf.x1 - leaf.x0;
      const height = leaf.y1 - leaf.y0;

      const nodeGroup = leafGroup.append("g");

      // Draw rectangle
      nodeGroup
        .append("rect")
        .attr("x", x)
        .attr("y", y)
        .attr("width", width)
        .attr("height", height)
        .attr("fill", this.colorForCoverage(node.coverage))
        .attr("stroke", this.COLORS.border)
        .attr("stroke-width", 1);

      // Draw "ticker style" labels when the tile is large enough: the name
      // sits at the top like a ticker symbol, with the coverage percentage as
      // the headline figure in the middle and the line count beneath it.
      if (width > 80 && height > 30) {
        const textGroup = nodeGroup.append("g");
        const centerX = x + width / 2;
        const ticker = this.formatTickerLines(node);

        // Symbol (file/class/function name) pinned to the top.
        textGroup
          .append("text")
          .attr("x", centerX)
          .attr("y", y + 16)
          .attr("text-anchor", "middle")
          .attr("font-family", "Arial, sans-serif")
          .attr("font-size", "12px")
          .attr("font-weight", "bold")
          .attr("letter-spacing", "0.5")
          .attr("fill", this.COLORS.text)
          .text(this.truncateText(ticker.name, width - 10));

        if (height > 50) {
          const centerY = y + height / 2;

          // Headline percentage, centred like a ticker quote.
          textGroup
            .append("text")
            .attr("x", centerX)
            .attr("y", centerY + 4)
            .attr("text-anchor", "middle")
            .attr("font-family", "Arial, sans-serif")
            .attr("font-size", "22px")
            .attr("font-weight", "bold")
            .attr("fill", this.COLORS.text)
            .text(ticker.percent);

          if (height > 70) {
            // Covered/total line count just below the headline figure.
            textGroup
              .append("text")
              .attr("x", centerX)
              .attr("y", centerY + 22)
              .attr("text-anchor", "middle")
              .attr("font-family", "Arial, sans-serif")
              .attr("font-size", "11px")
              .attr("fill", this.COLORS.text)
              .text(this.truncateText(ticker.lines, width - 10));
          }
        }
      }
    }

    // Convert SVG to string
    const svgString = document.body.innerHTML;

    // Rasterise the SVG to PNG. The font is bundled explicitly so the labels
    // are not dropped by resvg's font-less WASM runtime.
    const buffer = await rasteriseSvgToPng(svgString);

    fs.writeFileSync(opts.outputPath, buffer);

    return opts.outputPath;
  }

  /**
   * Draw a horizontal legend ending at `rightEdge`, vertically centred on
   * `centerY` so it sits on the same line as the title.
   */
  private static drawSVGLegend(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    rightEdge: number,
    centerY: number,
  ): void {
    const legendItems = [
      { label: "Fully Covered", color: this.COLORS.full },
      { label: "Partially Covered", color: this.COLORS.partial },
      { label: "Not Covered", color: this.COLORS.none },
    ];

    const swatchSize = 12;
    const swatchGap = 6; // between a swatch and its label
    const itemGap = 20; // between legend entries

    const itemWidths = legendItems.map(
      (item) =>
        swatchSize + swatchGap + item.label.length * this.PIXELS_PER_CHAR,
    );
    const totalWidth =
      itemWidths.reduce((sum, w) => sum + w, 0) +
      itemGap * (legendItems.length - 1);

    const legendGroup = svg.append("g").attr("class", "legend");

    let cursorX = rightEdge - totalWidth;
    for (let i = 0; i < legendItems.length; i++) {
      const item = legendItems[i];

      // Draw color square, vertically centred on the title line
      legendGroup
        .append("rect")
        .attr("x", cursorX)
        .attr("y", centerY - swatchSize / 2)
        .attr("width", swatchSize)
        .attr("height", swatchSize)
        .attr("fill", item.color)
        .attr("stroke", this.COLORS.border)
        .attr("stroke-width", 1);

      // Draw label
      legendGroup
        .append("text")
        .attr("x", cursorX + swatchSize + swatchGap)
        .attr("y", centerY + 4)
        .attr("font-family", "Arial, sans-serif")
        .attr("font-size", "12px")
        .attr("fill", this.COLORS.text)
        .text(item.label);

      cursorX += itemWidths[i] + itemGap;
    }
  }

  /**
   * Resolve the tile fill colour for a coverage state.
   */
  static colorForCoverage(coverage: TreemapNode["coverage"]): string {
    return this.COLORS[coverage] ?? this.COLORS.none;
  }

  /**
   * Build the three "ticker style" text rows for a tile: the symbol (name) on
   * top, the coverage percentage as the headline figure in the middle, and the
   * covered/total line count underneath.
   */
  static formatTickerLines(node: TreemapNode): {
    name: string;
    percent: string;
    lines: string;
  } {
    const percentValue =
      node.lineCount > 0
        ? Math.round((node.coveredLines / node.lineCount) * 100)
        : 0;

    return {
      name: node.functionName || path.basename(node.file),
      percent: `${percentValue}%`,
      lines: `${node.coveredLines}/${node.lineCount} lines`,
    };
  }

  /**
   * Truncate text to fit within a given width
   */
  private static truncateText(text: string, maxWidth: number): string {
    if (text.length * this.PIXELS_PER_CHAR <= maxWidth) return text;

    const maxChars =
      Math.floor(maxWidth / this.PIXELS_PER_CHAR) - this.ELLIPSIS_LENGTH;
    return text.substring(0, maxChars) + "...";
  }

  /**
   * Get the number of lines for a function
   */
  private static getFunctionLineCount(
    func: FunctionCoverage,
    fileCoverage: FileCoverage,
  ): number {
    // Find the next function to determine the range
    const functions = fileCoverage.functions.sort((a, b) => a.line - b.line);
    const funcIndex = functions.findIndex(
      (f) => f.name === func.name && f.line === func.line,
    );

    if (funcIndex === -1) return this.DEFAULT_FUNCTION_LINE_COUNT;

    const currentFunc = functions[funcIndex];
    const nextFunc = functions[funcIndex + 1];

    if (nextFunc) {
      return Math.max(nextFunc.line - currentFunc.line, 1);
    } else {
      // Last function - estimate based on file lines
      const maxLine = Math.max(
        ...fileCoverage.lines.map((l) => l.line),
        currentFunc.line + this.MIN_FUNCTION_SIZE_ESTIMATE,
      );
      return Math.max(maxLine - currentFunc.line, 1);
    }
  }

  /**
   * Get the number of covered lines for a function
   */
  private static getFunctionCoveredLines(
    func: FunctionCoverage,
    fileCoverage: FileCoverage,
  ): number {
    const functionLineCount = this.getFunctionLineCount(func, fileCoverage);
    const functionStartLine = func.line;
    const functionEndLine = functionStartLine + functionLineCount;

    // Count covered lines in the function range
    let coveredLines = 0;
    for (const line of fileCoverage.lines) {
      if (
        line.line >= functionStartLine &&
        line.line < functionEndLine &&
        line.hit > 0
      ) {
        coveredLines++;
      }
    }

    return coveredLines;
  }
}
