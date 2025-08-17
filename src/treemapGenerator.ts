import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import { JSDOM } from "jsdom";
import * as d3 from "d3";
import { hierarchy, treemap, HierarchyRectangularNode } from "d3-hierarchy";
import { CoverageAnalysis } from "./coverageAnalyzer";
import { FunctionCoverage, FileCoverage } from "./lcov";

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
}

export class TreemapGenerator {
  private static readonly DEFAULT_OPTIONS: TreemapOptions = {
    width: 1200,
    height: 800,
    outputPath: "./coverage-treemap.png",
  };

  private static readonly COLORS = {
    full: "#22c55e", // Green for full coverage
    partial: "#f59e0b", // Orange for partial coverage
    none: "#ef4444", // Red for no coverage
    background: "#f8fafc",
    border: "#e2e8f0",
    text: "#334155",
  };

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

    // Create a virtual DOM environment for D3
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    global.document = dom.window.document;
    global.window = dom.window as unknown as Window & typeof globalThis;

    // Create SVG element
    const svg = d3
      .select(dom.window.document.body)
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
      .size([opts.width - 40, opts.height - 80]) // Leave margin for title
      .padding(2);

    treemapLayout(root);

    // Draw title
    svg
      .append("text")
      .attr("x", opts.width / 2)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .attr("font-family", "Arial, sans-serif")
      .attr("font-size", "24px")
      .attr("fill", this.COLORS.text)
      .text("Coverage Treemap");

    // Draw legend
    this.drawSVGLegend(svg, opts.width - 200, 50);

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
      const x = leaf.x0 + 20; // Account for margin
      const y = leaf.y0 + 60; // Account for title and margin
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
        .attr(
          "fill",
          this.COLORS[node.coverage as keyof typeof this.COLORS] ||
            this.COLORS.none,
        )
        .attr("stroke", this.COLORS.border)
        .attr("stroke-width", 1);

      // Draw text if rectangle is large enough
      if (width > 80 && height > 30) {
        const textGroup = nodeGroup.append("g");

        // Function/file name
        const name = node.functionName || path.basename(node.file);
        textGroup
          .append("text")
          .attr("x", x + 5)
          .attr("y", y + 15)
          .attr("font-family", "Arial, sans-serif")
          .attr("font-size", "12px")
          .attr("fill", this.COLORS.text)
          .text(this.truncateText(name, width - 10));

        // Coverage info
        if (height > 50) {
          const coverageText = `${node.coveredLines}/${node.lineCount} lines`;
          textGroup
            .append("text")
            .attr("x", x + 5)
            .attr("y", y + 30)
            .attr("font-family", "Arial, sans-serif")
            .attr("font-size", "10px")
            .attr("fill", this.COLORS.text)
            .text(coverageText);

          if (height > 70) {
            const percentText = `${Math.round(
              (node.coveredLines / node.lineCount) * 100,
            )}%`;
            textGroup
              .append("text")
              .attr("x", x + 5)
              .attr("y", y + 45)
              .attr("font-family", "Arial, sans-serif")
              .attr("font-size", "10px")
              .attr("fill", this.COLORS.text)
              .text(percentText);
          }
        }
      }
    }

    // Convert SVG to string
    const svgString = dom.window.document.body.innerHTML;

    // Use Sharp to convert SVG to PNG
    const buffer = await sharp(Buffer.from(svgString)).png().toBuffer();

    fs.writeFileSync(opts.outputPath, buffer);

    return opts.outputPath;
  }

  /**
   * Draw SVG legend for the treemap
   */
  private static drawSVGLegend(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    x: number,
    y: number,
  ): void {
    const legendItems = [
      { label: "Fully Covered", color: this.COLORS.full },
      { label: "Partially Covered", color: this.COLORS.partial },
      { label: "Not Covered", color: this.COLORS.none },
    ];

    const legendGroup = svg.append("g").attr("class", "legend");

    for (let i = 0; i < legendItems.length; i++) {
      const item = legendItems[i];
      const itemY = y + i * 20;

      // Draw color square
      legendGroup
        .append("rect")
        .attr("x", x)
        .attr("y", itemY)
        .attr("width", 12)
        .attr("height", 12)
        .attr("fill", item.color)
        .attr("stroke", this.COLORS.border)
        .attr("stroke-width", 1);

      // Draw label
      legendGroup
        .append("text")
        .attr("x", x + 18)
        .attr("y", itemY + 9)
        .attr("font-family", "Arial, sans-serif")
        .attr("font-size", "12px")
        .attr("fill", this.COLORS.text)
        .text(item.label);
    }
  }

  /**
   * Truncate text to fit within a given width
   */
  private static truncateText(text: string, maxWidth: number): string {
    if (text.length * 7 <= maxWidth) return text; // Rough estimation: 7px per character

    const maxChars = Math.floor(maxWidth / 7) - 3;
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

    if (funcIndex === -1) return 10; // Default fallback

    const currentFunc = functions[funcIndex];
    const nextFunc = functions[funcIndex + 1];

    if (nextFunc) {
      return Math.max(nextFunc.line - currentFunc.line, 1);
    } else {
      // Last function - estimate based on file lines
      const maxLine = Math.max(
        ...fileCoverage.lines.map((l) => l.line),
        currentFunc.line + 10,
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
