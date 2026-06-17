/**
 * Shared data model for the coverage treemap.
 *
 * These types describe the hierarchy that drives the layout: a {@link TreemapData}
 * root holds one {@link TreemapFileGroup} per changed file, and each group holds
 * the {@link TreemapNode} tiles drawn for its functions (or a single file-level
 * tile when no function data is available).
 */

/** Coverage state of a single tile, used to pick its fill colour. */
export type CoverageState = "full" | "partial" | "none";

export interface TreemapNode {
  name: string;
  file: string;
  value: number; // line count
  coverage: CoverageState;
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

/** Any node in the d3 hierarchy: the root, a file group or a leaf tile. */
export type TreemapHierarchyDatum =
  | TreemapData
  | TreemapFileGroup
  | TreemapNode;

export interface TreemapOptions {
  width: number;
  height: number;
  outputPath: string;
  title: string;
  /** Optional second line under the title, e.g. commit hash and date. */
  subtitle?: string;
}
