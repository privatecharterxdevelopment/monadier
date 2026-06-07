/** GMX leverage — plan cap + 5x steps (1x, 5x, 10x, …) synced to vault_settings.leverage_multiplier */

export const MAX_LEVERAGE = 100;
export const LEVERAGE_STEP = 5;
export const MIN_LEVERAGE = 1;

/** @deprecated Use leverage slider — kept for legacy chip UIs */
export const LEVERAGE_CHIPS = [
  1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
] as const;

export function getMaxLeverageForPlan(_planTier?: string | null): number {
  return MAX_LEVERAGE;
}

export function getMaxLeverageLabel(planTier?: string | null): string {
  return `${getMaxLeverageForPlan(planTier)}x`;
}

export function getLeverageChips(planTier?: string | null): readonly number[] {
  const max = getMaxLeverageForPlan(planTier);
  return LEVERAGE_CHIPS.filter((v) => v <= max);
}

/** Snap to 1x or nearest 5x step, capped by plan max (persisted via Supabase + on-chain). */
export function snapLeverageToStep(value: number, planTier?: string | null): number {
  const max = getMaxLeverageForPlan(planTier);
  const v = Math.min(Math.max(MIN_LEVERAGE, Math.round(value)), max);
  if (v <= 2) return MIN_LEVERAGE;
  const stepped = Math.round(v / LEVERAGE_STEP) * LEVERAGE_STEP;
  return Math.min(Math.max(LEVERAGE_STEP, stepped), max);
}

export function clampLeverage(value: number, planTier?: string | null): number {
  return snapLeverageToStep(value, planTier);
}
