const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

/**
 * Format a byte count in human readable units (B/KB/MB/GB) with one decimal.
 */
export function formatFileSize(bytes: number): string {
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}
