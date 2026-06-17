import { CoverageState } from "./treemapModel";

/**
 * Visual theme for the treemap: the colour palette and the layout dimensions
 * that govern margins, header bands and tile sizing. Keeping these together
 * lets the renderer stay focused on drawing rather than tuning constants.
 */

// Palette sourced from the "1A535C / 4ECDC4 / F7FFF7 / FF6B6B / FFE66D"
// scheme: deep teal anchors the text, with teal/yellow/coral encoding the
// coverage states against a soft mint background.
export const COLORS = {
  full: "#4ecdc4", // Teal for full coverage
  partial: "#ffe66d", // Yellow for partial coverage
  none: "#ff6b6b", // Coral for no coverage
  background: "#f7fff7", // Soft mint
  border: "#1a535c", // Deep teal
  text: "#1a535c", // Deep teal
  subtitle: "#4a7a82", // Muted teal
} as const;

/** Resolve the tile fill colour for a coverage state. */
export function colorForCoverage(coverage: CoverageState): string {
  return COLORS[coverage] ?? COLORS.none;
}

export const LAYOUT = {
  // Smallest tile the layout is allowed to produce. When the proportional
  // treemap would draw a tile below these bounds, the whole canvas is scaled
  // up uniformly so every label has room to breathe. Readers can zoom into the
  // larger image rather than squint at unreadable thumbnails.
  minTileWidth: 96,
  minTileHeight: 56,

  // Upper bound for the auto-grown canvas. Past this point we accept that some
  // tiles stay small ("too much to render") instead of emitting an enormous
  // image that no viewer can open.
  maxCanvasWidth: 5000,
  maxCanvasHeight: 4000,

  // Line heights used when stacking wrapped labels inside a tile.
  tileNameLineHeight: 14,
  tilePercentHeight: 24,
  tileLinesHeight: 14,
  maxTileNameLines: 2,

  // Vertical space reserved at the top for the title, subtitle and legend so
  // none of them overlap the coverage tiles below.
  headerHeight: 70,
  sideMargin: 20,
  bottomMargin: 20,

  // Height of the per-file header band that carries the file path label.
  fileHeaderHeight: 18,
} as const;
