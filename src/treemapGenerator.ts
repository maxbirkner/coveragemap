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

/**
 * A file groups its function tiles together. The file path is drawn once on
 * the group's header border so individual function tiles only need to show the
 * function name.
 */
export interface TreemapFileGroup {
  name: string; // file basename, used as the group header label
  file: string; // full file path
  children: TreemapNode[];
}

export interface TreemapData {
  name: string;
  children: TreemapFileGroup[];
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

  // Smallest tile the layout is allowed to produce. When the proportional
  // treemap would draw a tile below these bounds, the whole canvas is scaled
  // up uniformly so every label has room to breathe. Readers can zoom into the
  // larger image rather than squint at unreadable thumbnails.
  private static readonly MIN_TILE_WIDTH = 96;
  private static readonly MIN_TILE_HEIGHT = 56;

  // Upper bound for the auto-grown canvas. Past this point we accept that some
  // tiles stay small ("too much to render") instead of emitting an enormous
  // image that no viewer can open.
  private static readonly MAX_CANVAS_WIDTH = 5000;
  private static readonly MAX_CANVAS_HEIGHT = 4000;

  // Line heights used when stacking wrapped labels inside a tile.
  private static readonly TILE_NAME_LINE_HEIGHT = 14;
  private static readonly TILE_PERCENT_HEIGHT = 24;
  private static readonly TILE_LINES_HEIGHT = 14;
  private static readonly MAX_TILE_NAME_LINES = 2;

  // Vertical space reserved at the top for the title, subtitle and legend so
  // none of them overlap the coverage tiles below.
  private static readonly HEADER_HEIGHT = 70;
  private static readonly SIDE_MARGIN = 20;
  private static readonly BOTTOM_MARGIN = 20;

  // Height of the per-file header band that carries the file path label.
  private static readonly FILE_HEADER_HEIGHT = 18;

  /**
   * Generate treemap data from coverage analysis
   */
  static generateTreemapData(analysis: CoverageAnalysis): TreemapData {
    const children: TreemapFileGroup[] = [];

    for (const file of analysis.changedFiles) {
      const basename = path.basename(file.path);

      if (!file.coverage) {
        // File without coverage data - treat as a single uncovered tile.
        children.push({
          name: basename,
          file: file.path,
          children: [
            {
              name: basename,
              file: file.path,
              value: Math.max(file.analysis.totalLines, 1),
              coverage: "none",
              lineCount: file.analysis.totalLines,
              coveredLines: 0,
            },
          ],
        });
        continue;
      }

      if (file.coverage.functions.length > 0) {
        // One tile per function, grouped under the file.
        const functionTiles: TreemapNode[] = [];

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

          functionTiles.push({
            name: func.name,
            file: file.path,
            value: Math.max(functionLines, 1), // Ensure minimum size
            coverage,
            lineCount: functionLines,
            coveredLines,
            functionName: func.name,
          });
        }

        children.push({
          name: basename,
          file: file.path,
          children: functionTiles,
        });
      } else {
        // File has coverage but no functions - single file-level tile.
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
          name: basename,
          file: file.path,
          children: [
            {
              name: basename,
              file: file.path,
              value: Math.max(file.analysis.totalLines, 1),
              coverage,
              lineCount: file.analysis.totalLines,
              coveredLines: file.analysis.coveredLines,
            },
          ],
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

    // Create D3 treemap layout
    const root = hierarchy<TreemapData | TreemapFileGroup | TreemapNode>(data)
      .sum((d) => (d as TreemapNode).value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    // Lay the tiles out for a given drawable area (excluding the title header
    // band and the page margins). The layout mutates `root` in place.
    const layoutInto = (innerWidth: number, innerHeight: number) => {
      treemap<TreemapData | TreemapFileGroup | TreemapNode>()
        .size([innerWidth, innerHeight])
        .paddingOuter(2)
        // Reserve a header band on each file group for its path label.
        .paddingTop((d) => (d.depth === 1 ? this.FILE_HEADER_HEIGHT : 2))
        .paddingInner(2)(root);
    };

    const baseInnerWidth = opts.width - this.SIDE_MARGIN * 2;
    const baseInnerHeight =
      opts.height - (this.HEADER_HEIGHT + this.BOTTOM_MARGIN);

    // Lay out once at the requested size, then grow the canvas uniformly if the
    // smallest tile would be too cramped to read. Scaling both dimensions by
    // the same factor keeps the squarified layout identical, just larger.
    layoutInto(baseInnerWidth, baseInnerHeight);
    const scale = this.scaleForMinimumTileSize(
      root.leaves() as HierarchyRectangularNode<
        TreemapData | TreemapFileGroup | TreemapNode
      >[],
      opts.width,
      opts.height,
    );

    const canvasWidth = Math.round(opts.width * scale);
    const canvasHeight = Math.round(opts.height * scale);
    if (scale > 1) {
      layoutInto(baseInnerWidth * scale, baseInnerHeight * scale);
    }

    // Create SVG element
    const svg = d3
      .select(document.body)
      .append("svg")
      .attr("width", canvasWidth)
      .attr("height", canvasHeight)
      .attr("xmlns", "http://www.w3.org/2000/svg");

    // Add background
    svg
      .append("rect")
      .attr("width", canvasWidth)
      .attr("height", canvasHeight)
      .attr("fill", this.COLORS.background);

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
    this.drawSVGLegend(svg, canvasWidth - this.SIDE_MARGIN, 35);

    // Draw a labelled box around each file's functions. The file path lives on
    // this header once, so the function tiles below only show the function
    // name.
    const fileGroupLayer = svg.append("g").attr("class", "file-groups");

    for (const group of (root.children ?? []) as HierarchyRectangularNode<
      TreemapData | TreemapFileGroup | TreemapNode
    >[]) {
      if (
        group.x0 === undefined ||
        group.y0 === undefined ||
        group.x1 === undefined ||
        group.y1 === undefined
      )
        continue;

      const groupData = group.data as TreemapFileGroup;
      const gx = group.x0 + this.SIDE_MARGIN;
      const gy = group.y0 + this.HEADER_HEIGHT;
      const gWidth = group.x1 - group.x0;
      const gHeight = group.y1 - group.y0;

      const groupNode = fileGroupLayer.append("g");

      // Header strip carrying the file path.
      groupNode
        .append("rect")
        .attr("x", gx)
        .attr("y", gy)
        .attr("width", gWidth)
        .attr("height", this.FILE_HEADER_HEIGHT)
        .attr("fill", this.COLORS.border)
        .attr("fill-opacity", 0.12);

      // Outline around the whole file group.
      groupNode
        .append("rect")
        .attr("x", gx)
        .attr("y", gy)
        .attr("width", gWidth)
        .attr("height", gHeight)
        .attr("fill", "none")
        .attr("stroke", this.COLORS.border)
        .attr("stroke-width", 1.5);

      // File path label, left-aligned in the header strip.
      groupNode
        .append("text")
        .attr("x", gx + 6)
        .attr("y", gy + this.FILE_HEADER_HEIGHT - 5)
        .attr("text-anchor", "start")
        .attr("font-family", "Arial, sans-serif")
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .attr("fill", this.COLORS.text)
        .text(this.truncateText(groupData.file, gWidth - 12));
    }

    // Draw the function/file coverage tiles.
    const leaves = root.leaves();
    const leafGroup = svg.append("g").attr("class", "leaves");

    for (const leaf of leaves as HierarchyRectangularNode<
      TreemapData | TreemapFileGroup | TreemapNode
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

      // Draw "ticker style" labels when the tile is large enough: the function
      // name sits on top like a ticker symbol, the coverage percentage is the
      // headline figure, and the line count sits beneath it. Long names wrap
      // onto multiple lines instead of being clipped. The file path is already
      // on the group header above.
      this.drawTileLabels(nodeGroup, node, x, y, width, height);
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

    const legendEntries = legendItems.map((item) => ({
      ...item,
      width: swatchSize + swatchGap + item.label.length * this.PIXELS_PER_CHAR,
    }));
    const totalWidth =
      legendEntries.reduce((sum, entry) => sum + entry.width, 0) +
      itemGap * (legendItems.length - 1);

    const legendGroup = svg.append("g").attr("class", "legend");

    let cursorX = rightEdge - totalWidth;
    for (const item of legendEntries) {
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

      cursorX += item.width + itemGap;
    }
  }

  /**
   * Resolve the tile fill colour for a coverage state.
   */
  static colorForCoverage(coverage: TreemapNode["coverage"]): string {
    return this.COLORS[coverage] ?? this.COLORS.none;
  }

  /**
   * Determine how much the canvas must grow so the smallest tile clears the
   * minimum readable size. Both dimensions are scaled by the same factor, which
   * keeps the squarified layout identical while enlarging every tile. The
   * factor is capped so pathological inputs cannot produce an unopenable image.
   */
  private static scaleForMinimumTileSize(
    leaves: HierarchyRectangularNode<
      TreemapData | TreemapFileGroup | TreemapNode
    >[],
    width: number,
    height: number,
  ): number {
    let scale = 1;
    for (const leaf of leaves) {
      if (
        leaf.x0 === undefined ||
        leaf.y0 === undefined ||
        leaf.x1 === undefined ||
        leaf.y1 === undefined
      )
        continue;

      const tileWidth = leaf.x1 - leaf.x0;
      const tileHeight = leaf.y1 - leaf.y0;
      if (tileWidth <= 0 || tileHeight <= 0) continue;

      scale = Math.max(
        scale,
        this.MIN_TILE_WIDTH / tileWidth,
        this.MIN_TILE_HEIGHT / tileHeight,
      );
    }

    const maxScale = Math.max(
      1,
      Math.min(this.MAX_CANVAS_WIDTH / width, this.MAX_CANVAS_HEIGHT / height),
    );
    return Math.min(scale, maxScale);
  }

  /**
   * Draw the centred "ticker style" labels inside a tile: the (wrapped)
   * function name, the headline coverage percentage and the covered/total line
   * count. Rows are revealed progressively so a short tile still shows its
   * headline figure, and the whole stack is vertically centred.
   */
  private static drawTileLabels(
    parent: d3.Selection<SVGGElement, unknown, null, undefined>,
    node: TreemapNode,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    // Below this the tile cannot host even a single readable figure.
    if (width < 60 || height < 28) return;

    const ticker = this.formatTickerLines(node);
    const centerX = x + width / 2;

    const nameLines = ticker.name
      ? this.wrapText(ticker.name, width - 10, this.MAX_TILE_NAME_LINES)
      : [];
    const nameBlock = nameLines.length * this.TILE_NAME_LINE_HEIGHT;

    const showName =
      nameLines.length > 0 &&
      height >= nameBlock + this.TILE_PERCENT_HEIGHT + 8;
    const showLines =
      height >=
      (showName ? nameBlock : 0) +
        this.TILE_PERCENT_HEIGHT +
        this.TILE_LINES_HEIGHT +
        8;

    let stackHeight = this.TILE_PERCENT_HEIGHT;
    if (showName) stackHeight += nameBlock;
    if (showLines) stackHeight += this.TILE_LINES_HEIGHT;

    const textGroup = parent.append("g");
    const drawRow = (
      text: string,
      baselineY: number,
      fontSize: number,
      bold: boolean,
    ): void => {
      const element = textGroup
        .append("text")
        .attr("x", centerX)
        .attr("y", baselineY)
        .attr("text-anchor", "middle")
        .attr("font-family", "Arial, sans-serif")
        .attr("font-size", `${fontSize}px`)
        .attr("fill", this.COLORS.text);
      if (bold) element.attr("font-weight", "bold");
      element.text(text);
    };

    let top = y + (height - stackHeight) / 2;

    if (showName) {
      nameLines.forEach((line, index) => {
        drawRow(line, top + index * this.TILE_NAME_LINE_HEIGHT + 11, 12, true);
      });
      top += nameBlock;
    }

    drawRow(ticker.percent, top + 18, 22, true);
    top += this.TILE_PERCENT_HEIGHT;

    if (showLines) {
      drawRow(ticker.lines, top + 11, 11, false);
    }
  }

  /**
   * Wrap text onto at most `maxLines` lines, each fitting within `maxWidth`.
   * Breaks prefer natural boundaries (path separators, dots, camelCase) and
   * fall back to hard character splits for unbreakable tokens. When the content
   * still overflows `maxLines`, the final line ends with an ellipsis — this is
   * the "too much text to render" cut-off.
   */
  static wrapText(text: string, maxWidth: number, maxLines: number): string[] {
    const maxChars = Math.max(1, Math.floor(maxWidth / this.PIXELS_PER_CHAR));
    if (text.length <= maxChars) return [text];

    const segments = this.segmentText(text).flatMap((segment) =>
      segment.length <= maxChars
        ? [segment]
        : this.hardSplit(segment, maxChars),
    );

    const lines: string[] = [];
    let line = "";
    for (const segment of segments) {
      if (line.length > 0 && line.length + segment.length > maxChars) {
        lines.push(line);
        line = segment;
      } else {
        line += segment;
      }
    }
    if (line.length > 0) lines.push(line);

    if (lines.length <= maxLines) return lines;

    const kept = lines.slice(0, maxLines);
    const lastIndex = maxLines - 1;
    const last = kept[lastIndex] ?? "";
    const room = Math.max(0, maxChars - this.ELLIPSIS_LENGTH);
    kept[lastIndex] =
      (last.length > room ? last.substring(0, room) : last) + "...";
    return kept;
  }

  /**
   * Split text into break-friendly segments. A segment ends after a separator
   * (`/`, `.`, `_`, `-`, space) or before a camelCase hump, so wrapping favours
   * readable boundaries within identifiers and file paths.
   */
  private static segmentText(text: string): string[] {
    const segments: string[] = [];
    let current = "";
    for (let index = 0; index < text.length; index++) {
      const char = text[index] as string;
      const next = text[index + 1];
      current += char;

      const isSeparator =
        char === "/" ||
        char === "." ||
        char === "_" ||
        char === "-" ||
        char === " ";
      const isCamelBoundary =
        next !== undefined && /[a-z0-9]/.test(char) && /[A-Z]/.test(next);

      if (isSeparator || isCamelBoundary) {
        segments.push(current);
        current = "";
      }
    }
    if (current.length > 0) segments.push(current);
    return segments;
  }

  /**
   * Hard-split an unbreakable token into chunks of at most `maxChars`.
   */
  private static hardSplit(text: string, maxChars: number): string[] {
    const chunks: string[] = [];
    for (let index = 0; index < text.length; index += maxChars) {
      chunks.push(text.substring(index, index + maxChars));
    }
    return chunks;
  }

  /**
   * Build the three "ticker style" text rows for a tile: the function name on
   * top, the coverage percentage as the headline figure in the middle, and the
   * covered/total line count underneath.
   *
   * The name is the function name only; the owning file path is drawn once on
   * the group header, so file-level tiles (without a function name) return an
   * empty name and the renderer omits that row.
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
      name: node.functionName ?? "",
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
    if (!currentFunc) return this.DEFAULT_FUNCTION_LINE_COUNT;
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
