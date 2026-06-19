import { config } from '../config';

/**
 * HL builder fee `f` is tenths of a basis point.
 * Fee USD ≈ notional × (f / 100_000).
 */
export function notionalBuilderFeeUsd(notionalUsd: number, tenthsBps: number): number {
  if (notionalUsd <= 0 || tenthsBps <= 0) return 0;
  return (notionalUsd * tenthsBps) / 100_000;
}

export function parseMaxBuilderTenthsBps(rate: string): number {
  const m = rate.trim().match(/^([\d.]+)\s*%?$/);
  if (!m) return 50;
  const pct = parseFloat(m[1]);
  if (!Number.isFinite(pct) || pct <= 0) return 50;
  return Math.min(100, Math.floor(pct * 1000));
}

/** Pick builder `f` so fee ≈ successFeeBps% of profit, capped by user max approval. */
export function successFeeToCloseBuilderTenthsBps(
  profitUsd: number,
  notionalUsd: number,
  successFeeBps: number,
  maxTenthsBps: number
): number {
  if (profitUsd <= 0 || notionalUsd <= 0 || maxTenthsBps <= 0) return 0;

  const targetFeeUsd = (profitUsd * successFeeBps) / 10_000;
  const raw = Math.ceil((targetFeeUsd / notionalUsd) * 100_000);
  if (raw <= 0) return 0;
  return Math.min(Math.max(1, raw), maxTenthsBps);
}

export function resolveHlOrderBuilder(opts: {
  notionalUsd: number;
  profitUsd?: number;
  isClose: boolean;
}): { b: `0x${string}`; f: number } | undefined {
  // Closes never use HL builder fee — requires per-user approval; fees accrued in DB.
  if (opts.isClose) return undefined;

  const addr = config.hyperliquid.builderAddress;
  if (!addr) return undefined;

  const maxTenths = parseMaxBuilderTenthsBps(
    config.hyperliquid.builderMaxApprovalRate || '0.1%'
  );

  const openFee = config.hyperliquid.openBuilderFeePerp;
  if (openFee <= 0) return undefined;
  return { b: addr, f: Math.min(openFee, maxTenths) };
}

export function estimateCollectedSuccessFee(
  profitUsd: number,
  notionalUsd: number,
  tenthsBps: number
): number {
  const viaBuilder = notionalBuilderFeeUsd(notionalUsd, tenthsBps);
  const target = (profitUsd * config.hyperliquid.successFeeBps) / 10_000;
  return Math.min(viaBuilder, target);
}
