/** 0 = off. Ignores legacy 0.1% phantom from pre-20261231 save RPC (GREATEST(0.1, 0)). */
export function normalizeVaultStopLossPct(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(Number(raw))) return 0;
  const v = Number(raw);
  if (v <= 0) return 0;
  if (Math.abs(v - 0.1) < 1e-9) return 0;
  return v;
}
