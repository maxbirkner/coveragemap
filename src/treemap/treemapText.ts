import { TreemapNode } from "./treemapModel";

/**
 * Text helpers for tile labels: estimating widths, wrapping long names and
 * formatting the "ticker style" rows. These are pure string functions, kept
 * separate from the SVG drawing so they can be unit-tested in isolation.
 */

/** Approximate width of one character at the label font size, in pixels. */
export const PIXELS_PER_CHAR = 7;

const ELLIPSIS = "...";

/**
 * Wrap text onto at most `maxLines` lines, each fitting within `maxWidth`.
 * Breaks prefer natural boundaries (path separators, dots, camelCase) and
 * fall back to hard character splits for unbreakable tokens. When the content
 * still overflows `maxLines`, the final line ends with an ellipsis — this is
 * the "too much text to render" cut-off.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / PIXELS_PER_CHAR));
  if (text.length <= maxChars) return [text];

  const segments = segmentText(text).flatMap((segment) =>
    segment.length <= maxChars ? [segment] : hardSplit(segment, maxChars),
  );

  const lines = packSegments(segments, maxChars);

  return lines.length <= maxLines
    ? lines
    : ellipsiseOverflow(lines, maxLines, maxChars);
}

/** Truncate text to fit within `maxWidth`, appending an ellipsis when cut. */
export function truncateText(text: string, maxWidth: number): string {
  if (text.length * PIXELS_PER_CHAR <= maxWidth) return text;

  const maxChars = Math.floor(maxWidth / PIXELS_PER_CHAR) - ELLIPSIS.length;
  return text.substring(0, Math.max(0, maxChars)) + ELLIPSIS;
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
export function formatTickerLines(node: TreemapNode): {
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

/** Greedily pack segments into lines no wider than `maxChars`. */
function packSegments(segments: string[], maxChars: number): string[] {
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
  return lines;
}

/** Keep `maxLines` lines and mark the truncation with a trailing ellipsis. */
function ellipsiseOverflow(
  lines: string[],
  maxLines: number,
  maxChars: number,
): string[] {
  const kept = lines.slice(0, maxLines);
  const lastIndex = maxLines - 1;
  const last = kept[lastIndex] ?? "";
  const room = Math.max(0, maxChars - ELLIPSIS.length);
  kept[lastIndex] =
    (last.length > room ? last.substring(0, room) : last) + ELLIPSIS;
  return kept;
}

/**
 * Split text into break-friendly segments. A segment ends after a separator
 * (`/`, `.`, `_`, `-`, space) or before a camelCase hump, so wrapping favours
 * readable boundaries within identifiers and file paths.
 */
function segmentText(text: string): string[] {
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

/** Hard-split an unbreakable token into chunks of at most `maxChars`. */
function hardSplit(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxChars) {
    chunks.push(text.substring(index, index + maxChars));
  }
  return chunks;
}
