import { getHlBuilderConfig } from './builderConfig';
import type { HlPosition } from './user';
import { toNum } from './parse';

/** Fee USD ≈ notional × (f / 100_000). */
export function notionalBuilderFeeUsd(notionalUsd: number, tenthsBps: number): number {
  if (notionalUsd <= 0 || tenthsBps <= 0) return 0;
  return (notionalUsd * tenthsBps) / 100_000;
}

export function parseMaxBuilderTenthsBps(rate: string): number {
  const m = rate.trim().match(/^([\d.]+)\s*%?$/);
  if (!m) return 100;
  const pct = parseFloat(m[1]);
  if (!Number.isFinite(pct) || pct <= 0) return 100;
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

export function proratePositionProfitUsd(
  position: HlPosition | undefined,
  closeSize: number
): number {
  if (!position) return 0;
  const posSize = Math.abs(toNum(position.szi));
  if (posSize <= 0 || closeSize <= 0) return 0;
  const upnl = toNum(position.unrealizedPnl);
  if (upnl <= 0) return 0;
  return upnl * Math.min(1, closeSize / posSize);
}

export function getProTradeSuccessFeeBps(): number {
  return getHlBuilderConfig().proTradeSuccessFeeBps;
}

export function formatProTradeSuccessFeeLabel(bps?: number): string {
  const pct = (bps ?? getProTradeSuccessFeeBps()) / 100;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}% on wins`;
}
