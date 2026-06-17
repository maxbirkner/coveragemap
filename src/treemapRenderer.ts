import { parseHTML } from "linkedom";
import * as d3 from "d3";
import { hierarchy, treemap, HierarchyRectangularNode } from "d3-hierarchy";
import {
  TreemapData,
  TreemapFileGroup,
  TreemapHierarchyDatum,
  TreemapNode,
  TreemapOptions,
} from "./treemapModel";
import { COLORS, colorForCoverage, LAYOUT } from "./treemapTheme";
import {
  formatTickerLines,
  PIXELS_PER_CHAR,
  truncateText,
  wrapText,
} from "./treemapText";

/**
 * Renders {@link TreemapData} into an SVG string using d3 and a lightweight
 * linkedom DOM. The drawing is split into small helpers — layout, header,
 * file-group frames and individual tiles — so each concern stays readable.
 */

type LayoutNode = HierarchyRectangularNode<TreemapHierarchyDatum>;
type SvgSelection = d3.Selection<SVGSVGElement, unknown, null, undefined>;
type GroupSelection = d3.Selection<SVGGElement, unknown, null, undefined>;

const FONT_FAMILY = "Arial, sans-serif";

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function renderTreemapSvg(
  data: TreemapData,
  opts: TreemapOptions,
): string {
  // linkedom is a self-contained DOM that bundles cleanly to a single ESM file
  // (unlike jsdom, which loads on-disk assets at runtime). D3's selection API
  // operates on the document node passed to it, so no global patching is
  // required.
  const { document } = parseHTML(`<!DOCTYPE html><html><body></body></html>`);

  const { root, canvasWidth, canvasHeight } = layoutTreemap(data, opts);

  const svg = d3
    .select(document.body)
    .append("svg")
    .attr("width", canvasWidth)
    .attr("height", canvasHeight)
    .attr("xmlns", "http://www.w3.org/2000/svg") as SvgSelection;

  drawBackground(svg, canvasWidth, canvasHeight);
  drawHeader(svg, opts, canvasWidth);
  drawFileGroups(svg, root);
  drawTiles(svg, root);

  return document.body.innerHTML;
}

/**
 * Lay the tiles out, growing the canvas uniformly when the smallest tile would
 * be too cramped to read. Scaling both dimensions by the same factor keeps the
 * squarified layout identical, just larger. The layout mutates `root` in place.
 */
function layoutTreemap(
  data: TreemapData,
  opts: TreemapOptions,
): { root: LayoutNode; canvasWidth: number; canvasHeight: number } {
  const root = hierarchy<TreemapHierarchyDatum>(data)
    .sum((d) => (d as TreemapNode).value || 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0)) as LayoutNode;

  const baseInnerWidth = opts.width - LAYOUT.sideMargin * 2;
  const baseInnerHeight =
    opts.height - (LAYOUT.headerHeight + LAYOUT.bottomMargin);

  const applyLayout = (innerWidth: number, innerHeight: number): void => {
    treemap<TreemapHierarchyDatum>()
      .size([innerWidth, innerHeight])
      .paddingOuter(2)
      // Reserve a header band on each file group for its path label.
      .paddingTop((d) => (d.depth === 1 ? LAYOUT.fileHeaderHeight : 2))
      .paddingInner(2)(root);
  };

  applyLayout(baseInnerWidth, baseInnerHeight);
  const scale = scaleForMinimumTileSize(root.leaves(), opts.width, opts.height);
  if (scale > 1) {
    applyLayout(baseInnerWidth * scale, baseInnerHeight * scale);
  }

  return {
    root,
    canvasWidth: Math.round(opts.width * scale),
    canvasHeight: Math.round(opts.height * scale),
  };
}

/**
 * Determine how much the canvas must grow so the smallest tile clears the
 * minimum readable size. Both dimensions are scaled by the same factor, which
 * keeps the squarified layout identical while enlarging every tile. The factor
 * is capped so pathological inputs cannot produce an unopenable image.
 */
function scaleForMinimumTileSize(
  leaves: LayoutNode[],
  width: number,
  height: number,
): number {
  let scale = 1;
  for (const leaf of leaves) {
    const bounds = rawBounds(leaf);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue;

    scale = Math.max(
      scale,
      LAYOUT.minTileWidth / bounds.width,
      LAYOUT.minTileHeight / bounds.height,
    );
  }

  const maxScale = Math.max(
    1,
    Math.min(LAYOUT.maxCanvasWidth / width, LAYOUT.maxCanvasHeight / height),
  );
  return Math.min(scale, maxScale);
}

function drawBackground(
  svg: SvgSelection,
  width: number,
  height: number,
): void {
  svg
    .append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", COLORS.background);
}

/** Draw the title, optional subtitle and the legend in the reserved band. */
function drawHeader(
  svg: SvgSelection,
  opts: TreemapOptions,
  canvasWidth: number,
): void {
  appendText(svg, {
    x: LAYOUT.sideMargin,
    y: 35,
    anchor: "start",
    fontSize: 24,
    fill: COLORS.text,
    text: opts.title,
  });

  if (opts.subtitle) {
    appendText(svg, {
      x: LAYOUT.sideMargin,
      y: 56,
      anchor: "start",
      fontSize: 12,
      fill: COLORS.subtitle,
      text: opts.subtitle,
    });
  }

  drawLegend(svg, canvasWidth - LAYOUT.sideMargin, 35);
}

/**
 * Draw a horizontal legend ending at `rightEdge`, vertically centred on
 * `centerY` so it sits on the same line as the title.
 */
function drawLegend(
  svg: SvgSelection,
  rightEdge: number,
  centerY: number,
): void {
  const items: { label: string; color: string }[] = [
    { label: "Fully Covered", color: COLORS.full },
    { label: "Partially Covered", color: COLORS.partial },
    { label: "Not Covered", color: COLORS.none },
  ];

  const swatchSize = 12;
  const swatchGap = 6; // between a swatch and its label
  const itemGap = 20; // between legend entries

  const entries = items.map((item) => ({
    ...item,
    width: swatchSize + swatchGap + item.label.length * PIXELS_PER_CHAR,
  }));
  const totalWidth =
    entries.reduce((sum, entry) => sum + entry.width, 0) +
    itemGap * (entries.length - 1);

  const legend = svg.append("g").attr("class", "legend") as GroupSelection;

  let cursorX = rightEdge - totalWidth;
  for (const entry of entries) {
    legend
      .append("rect")
      .attr("x", cursorX)
      .attr("y", centerY - swatchSize / 2)
      .attr("width", swatchSize)
      .attr("height", swatchSize)
      .attr("fill", entry.color)
      .attr("stroke", COLORS.border)
      .attr("stroke-width", 1);

    appendText(legend, {
      x: cursorX + swatchSize + swatchGap,
      y: centerY + 4,
      anchor: "start",
      fontSize: 12,
      fill: COLORS.text,
      text: entry.label,
    });

    cursorX += entry.width + itemGap;
  }
}

/**
 * Draw a labelled frame around each file's functions. The file path lives on
 * this header once, so the function tiles below only show the function name.
 */
function drawFileGroups(svg: SvgSelection, root: LayoutNode): void {
  const layer = svg.append("g").attr("class", "file-groups") as GroupSelection;

  for (const group of (root.children ?? []) as LayoutNode[]) {
    const bounds = tileBounds(group);
    if (!bounds) continue;

    const groupData = group.data as TreemapFileGroup;
    const node = layer.append("g") as GroupSelection;

    // Header strip carrying the file path.
    node
      .append("rect")
      .attr("x", bounds.x)
      .attr("y", bounds.y)
      .attr("width", bounds.width)
      .attr("height", LAYOUT.fileHeaderHeight)
      .attr("fill", COLORS.border)
      .attr("fill-opacity", 0.12);

    // Outline around the whole file group.
    node
      .append("rect")
      .attr("x", bounds.x)
      .attr("y", bounds.y)
      .attr("width", bounds.width)
      .attr("height", bounds.height)
      .attr("fill", "none")
      .attr("stroke", COLORS.border)
      .attr("stroke-width", 1.5);

    appendText(node, {
      x: bounds.x + 6,
      y: bounds.y + LAYOUT.fileHeaderHeight - 5,
      anchor: "start",
      fontSize: 11,
      fill: COLORS.text,
      bold: true,
      text: truncateText(groupData.file, bounds.width - 12),
    });
  }
}

/** Draw the function/file coverage tiles. */
function drawTiles(svg: SvgSelection, root: LayoutNode): void {
  const layer = svg.append("g").attr("class", "leaves") as GroupSelection;

  for (const leaf of root.leaves()) {
    const bounds = tileBounds(leaf);
    if (!bounds) continue;

    const node = leaf.data as TreemapNode;
    const tile = layer.append("g") as GroupSelection;

    tile
      .append("rect")
      .attr("x", bounds.x)
      .attr("y", bounds.y)
      .attr("width", bounds.width)
      .attr("height", bounds.height)
      .attr("fill", colorForCoverage(node.coverage))
      .attr("stroke", COLORS.border)
      .attr("stroke-width", 1);

    drawTileLabels(tile, node, bounds);
  }
}

/**
 * Draw the centred "ticker style" labels inside a tile: the (wrapped) function
 * name, the headline coverage percentage and the covered/total line count.
 * Rows are revealed progressively so a short tile still shows its headline
 * figure, and the whole stack is vertically centred.
 */
function drawTileLabels(
  parent: GroupSelection,
  node: TreemapNode,
  bounds: Bounds,
): void {
  // Below this the tile cannot host even a single readable figure.
  if (bounds.width < 60 || bounds.height < 28) return;

  const ticker = formatTickerLines(node);
  const centerX = bounds.x + bounds.width / 2;

  const nameLines = ticker.name
    ? wrapText(ticker.name, bounds.width - 10, LAYOUT.maxTileNameLines)
    : [];
  const nameBlock = nameLines.length * LAYOUT.tileNameLineHeight;

  const showName =
    nameLines.length > 0 &&
    bounds.height >= nameBlock + LAYOUT.tilePercentHeight + 8;
  const showLines =
    bounds.height >=
    (showName ? nameBlock : 0) +
      LAYOUT.tilePercentHeight +
      LAYOUT.tileLinesHeight +
      8;

  let stackHeight = LAYOUT.tilePercentHeight;
  if (showName) stackHeight += nameBlock;
  if (showLines) stackHeight += LAYOUT.tileLinesHeight;

  const group = parent.append("g") as GroupSelection;
  const drawRow = (
    text: string,
    baselineY: number,
    fontSize: number,
    bold: boolean,
  ): void => {
    appendText(group, {
      x: centerX,
      y: baselineY,
      anchor: "middle",
      fontSize,
      fill: COLORS.text,
      bold,
      text,
    });
  };

  let top = bounds.y + (bounds.height - stackHeight) / 2;

  if (showName) {
    nameLines.forEach((line, index) => {
      drawRow(line, top + index * LAYOUT.tileNameLineHeight + 11, 12, true);
    });
    top += nameBlock;
  }

  drawRow(ticker.percent, top + 18, 22, true);
  top += LAYOUT.tilePercentHeight;

  if (showLines) {
    drawRow(ticker.lines, top + 11, 11, false);
  }
}

interface TextSpec {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  fontSize: number;
  fill: string;
  text: string;
  bold?: boolean;
}

/** Append a styled <text> element, centralising the shared font attributes. */
function appendText(
  parent: SvgSelection | GroupSelection,
  spec: TextSpec,
): void {
  const element = parent
    .append("text")
    .attr("x", spec.x)
    .attr("y", spec.y)
    .attr("text-anchor", spec.anchor)
    .attr("font-family", FONT_FAMILY)
    .attr("font-size", `${spec.fontSize}px`)
    .attr("fill", spec.fill);
  if (spec.bold) element.attr("font-weight", "bold");
  element.text(spec.text);
}

/** Bounds of a node relative to the raw layout (no page offsets applied). */
function rawBounds(node: LayoutNode): Bounds | null {
  if (
    node.x0 === undefined ||
    node.y0 === undefined ||
    node.x1 === undefined ||
    node.y1 === undefined
  ) {
    return null;
  }
  return {
    x: node.x0,
    y: node.y0,
    width: node.x1 - node.x0,
    height: node.y1 - node.y0,
  };
}

/** Bounds of a node shifted into the drawable area (past margins/header). */
function tileBounds(node: LayoutNode): Bounds | null {
  const bounds = rawBounds(node);
  if (!bounds) return null;
  return {
    x: bounds.x + LAYOUT.sideMargin,
    y: bounds.y + LAYOUT.headerHeight,
    width: bounds.width,
    height: bounds.height,
  };
}
