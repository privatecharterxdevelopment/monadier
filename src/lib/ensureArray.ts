/** Coerce unknown API / RPC values to arrays before spread or for…of. */
export function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

/** Read a JSON array from localStorage — returns [] on missing, corrupt, or non-array data. */
export function loadJsonArrayFromStorage<T>(
  key: string,
  mapItem?: (raw: unknown) => T
): T[] {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    if (!mapItem) return parsed as T[];
    return parsed.map(mapItem);
  } catch {
    return [];
  }
}
