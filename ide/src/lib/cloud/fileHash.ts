/**
 * fileHash.ts
 *
 * Fast, non-cryptographic FNV-1a hash for change detection.
 * Used by the cloud sync engine to build a path→hash map and
 * identify which files have changed since the last save, keeping
 * network payloads as small as possible.
 */

/**
 * Compute an FNV-1a 32-bit hash of a string.
 * Returns an 8-character lowercase hex string.
 */
export function hashString(content: string): string {
  let hash = 2166136261; // FNV-1a 32-bit offset basis
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    // FNV prime 16777619, kept as 32-bit unsigned integer
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Build a map of { filePath → contentHash } for a list of flat files.
 * Useful for comparing local vs. remote state without transferring content.
 */
export function buildHashMap(
  files: Array<{ path: string; content: string }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const file of files) {
    map[file.path] = hashString(file.content);
  }
  return map;
}

/**
 * Return only the files whose hash differs from the supplied reference map.
 * Files whose path is not in the reference map are always included (new files).
 */
export function diffFiles(
  current: Array<{ path: string; content: string }>,
  referenceHashes: Record<string, string>,
): Array<{ path: string; content: string }> {
  return current.filter(
    (f) => referenceHashes[f.path] !== hashString(f.content),
  );
}

/**
 * Return paths that are in the reference map but not in the current file list
 * (i.e. files that were deleted locally).
 */
export function deletedPaths(
  current: Array<{ path: string }>,
  referenceHashes: Record<string, string>,
): string[] {
  const currentPaths = new Set(current.map((f) => f.path));
  return Object.keys(referenceHashes).filter((p) => !currentPaths.has(p));
}
