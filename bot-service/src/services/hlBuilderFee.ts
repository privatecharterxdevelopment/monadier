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

/** Attach Monadier builder on opens (optional flat) and profitable closes (10% success fee). */
export function resolveHlOrderBuilder(opts: {
  notionalUsd: number;
  profitUsd?: number;
  isClose: boolean;
  approvedMaxTenthsBps?: number;
}): { b: `0x${string}`; f: number } | undefined {
  const addr = config.hyperliquid.builderAddress;
  if (!addr) return undefined;

  const maxTenths = parseMaxBuilderTenthsBps(
    config.hyperliquid.builderMaxApprovalRate || '0.1%'
  );
  const approvedCap = Math.min(opts.approvedMaxTenthsBps ?? maxTenths, maxTenths);

  if (opts.isClose) {
    const profit = opts.profitUsd ?? 0;
    if (profit <= 0 || opts.notionalUsd <= 0 || approvedCap <= 0) return undefined;
    const f = successFeeToCloseBuilderTenthsBps(
      profit,
      opts.notionalUsd,
      config.hyperliquid.successFeeBps,
      approvedCap
    );
    if (f <= 0) return undefined;
    return { b: addr, f };
  }

  const openFee = config.hyperliquid.openBuilderFeePerp;
  if (openFee <= 0) return undefined;
  return { b: addr, f: Math.min(openFee, approvedCap) };
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
