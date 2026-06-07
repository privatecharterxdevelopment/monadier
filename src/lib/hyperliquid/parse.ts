/** Coerce API / form values to a finite number. */
export function toNum(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Safe deep read for optional API fields (e.g. margin.accountValue). */
export function readNum(
  source: unknown,
  path: string[],
  fallback = 0
): number {
  let cur: unknown = source;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return fallback;
    cur = (cur as Record<string, unknown>)[key];
  }
  return toNum(cur, fallback);
}
