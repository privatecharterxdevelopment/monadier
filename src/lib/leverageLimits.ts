/** Hyperliquid per-asset max leverage (from HL meta API; refresh if HL changes tiers). */
export const HL_MAX_LEVERAGE_BY_COIN: Record<string, number> = {
  BTC: 40,
  ETH: 25,
  ARB: 10,
};

export const HL_BOT_MAX_LEVERAGE = Math.min(
  HL_MAX_LEVERAGE_BY_COIN.BTC,
  HL_MAX_LEVERAGE_BY_COIN.ETH
);

export const MAX_LEVERAGE = 40;
export const LEVERAGE_STEP = 5;
export const MIN_LEVERAGE = 1;

/** @deprecated Use leverage slider — kept for legacy chip UIs */
export const LEVERAGE_CHIPS = [1, 5, 10, 15, 20, 25, 30, 35, 40] as const;

export function getMaxLeverageForPlan(
  _planTier?: string | null,
  hlSliderMax?: number
): number {
  const hlCap = hlSliderMax && hlSliderMax > 0 ? hlSliderMax : MAX_LEVERAGE;
  return Math.min(MAX_LEVERAGE, hlCap);
}

export function getMaxLeverageLabel(
  planTier?: string | null,
  hlSliderMax?: number
): string {
  return `${getMaxLeverageForPlan(planTier, hlSliderMax)}x`;
}

export function getLeverageChips(
  planTier?: string | null,
  hlSliderMax?: number
): readonly number[] {
  const max = getMaxLeverageForPlan(planTier, hlSliderMax);
  return LEVERAGE_CHIPS.filter((v) => v <= max);
}

/** Snap to 1x or nearest 5x step, capped by HL (persisted via Supabase). */
export function snapLeverageToStep(
  value: number,
  planTier?: string | null,
  hlSliderMax?: number
): number {
  const max = getMaxLeverageForPlan(planTier, hlSliderMax);
  const v = Math.min(Math.max(MIN_LEVERAGE, Math.round(value)), max);
  if (v <= 2) return MIN_LEVERAGE;
  const stepped = Math.round(v / LEVERAGE_STEP) * LEVERAGE_STEP;
  return Math.min(Math.max(LEVERAGE_STEP, stepped), max);
}

export function clampLeverage(
  value: number,
  planTier?: string | null,
  hlSliderMax?: number
): number {
  return snapLeverageToStep(value, planTier, hlSliderMax);
}
