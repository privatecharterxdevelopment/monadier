/** Illustrative bot ROI defaults — conservative marketing estimates. */
export const BOT_ROI_DEFAULTS = {
  takeProfitPercent: 10,
  stopLossPercent: 5,
  targetWinRate: 0.8,
  winsPerSample: 8,
  sampleSize: 10,
  tradesPerDayMin: 6,
  tradesPerDayMax: 15,
  maxLeverage: 40,
  /** Reference stake for monthly profit anchor ($80/mo @ 20×). */
  refStakeUsd: 50,
  refLeverage: 20,
  refMonthlyProfitUsd: 80,
  /** Per-trade % of stake before leverage (wins vs losses). */
  winPctOfStakePerLeverage: 0.004,
  lossPctOfStakePerLeverage: 0.005,
} as const;

export type BotRoiEstimate = {
  stakeUsd: number;
  leverage: number;
  tradesPerDay: number;
  profitPerWinUsd: number;
  lossPerLossUsd: number;
  projectedWins: number;
  projectedLosses: number;
  sampleSize: number;
  winRate: number;
  /** Illustrative net profit over ~30 days. */
  monthlyProfitUsd: number;
  /** Stake + monthly profit. */
  monthlyBalanceUsd: number;
  monthlyReturnMultiple: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Wins in a 10-trade sample — high leverage = more losses. */
function projectedWinsForLeverage(leverage: number): number {
  const lev = clamp(Math.round(leverage), 1, BOT_ROI_DEFAULTS.maxLeverage);
  if (lev <= 20) return BOT_ROI_DEFAULTS.winsPerSample;
  const t = (lev - 20) / (BOT_ROI_DEFAULTS.maxLeverage - 20);
  return Math.max(6, Math.round(BOT_ROI_DEFAULTS.winsPerSample - t * 2));
}

/** Monthly profit scales with stake and leverage (anchor: $50 @ 20× → $80). */
function estimateMonthlyProfitUsd(stakeUsd: number, leverage: number): number {
  const stakeRatio = stakeUsd / BOT_ROI_DEFAULTS.refStakeUsd;
  const levRatio = leverage / BOT_ROI_DEFAULTS.refLeverage;
  const levFactor = Math.pow(levRatio, 0.92);
  const raw =
    BOT_ROI_DEFAULTS.refMonthlyProfitUsd * stakeRatio * levFactor;

  const capMultiplier = 2 + (leverage / BOT_ROI_DEFAULTS.maxLeverage) * 0.5;
  const cap = stakeUsd * capMultiplier;
  return clamp(raw, 0, cap);
}

function estimateTradesPerDay(stakeUsd: number): number {
  if (stakeUsd <= 0) return BOT_ROI_DEFAULTS.tradesPerDayMin;
  const scaled = Math.round(
    BOT_ROI_DEFAULTS.tradesPerDayMin + Math.min(9, stakeUsd / 400)
  );
  return clamp(scaled, BOT_ROI_DEFAULTS.tradesPerDayMin, BOT_ROI_DEFAULTS.tradesPerDayMax);
}

export function estimateBotRoi(stakeUsd: number, leverage: number): BotRoiEstimate {
  const stake = Math.max(0, Number.isFinite(stakeUsd) ? stakeUsd : 0);
  const lev = clamp(
    Math.round(Number.isFinite(leverage) ? leverage : 1),
    1,
    BOT_ROI_DEFAULTS.maxLeverage
  );
  const tradesPerDay = estimateTradesPerDay(stake);

  const profitPerWinUsd =
    stake * BOT_ROI_DEFAULTS.winPctOfStakePerLeverage * lev;
  const lossPerLossUsd =
    stake * BOT_ROI_DEFAULTS.lossPctOfStakePerLeverage * lev;

  const projectedWins = projectedWinsForLeverage(lev);
  const sampleSize = BOT_ROI_DEFAULTS.sampleSize;
  const projectedLosses = sampleSize - projectedWins;
  const winRate = projectedWins / sampleSize;

  const monthlyProfitUsd = estimateMonthlyProfitUsd(stake, lev);
  const monthlyBalanceUsd = stake + monthlyProfitUsd;
  const monthlyReturnMultiple = stake > 0 ? monthlyBalanceUsd / stake : 1;

  return {
    stakeUsd: stake,
    leverage: lev,
    tradesPerDay,
    profitPerWinUsd,
    lossPerLossUsd,
    projectedWins,
    projectedLosses,
    sampleSize,
    winRate,
    monthlyProfitUsd,
    monthlyBalanceUsd,
    monthlyReturnMultiple,
  };
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${Math.round(value).toLocaleString()}`;
  if (abs >= 100) return `$${value.toFixed(0)}`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(2)}`;
}

export function formatMultiple(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${value.toFixed(1)}×`;
}

export function formatWinRate(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}
