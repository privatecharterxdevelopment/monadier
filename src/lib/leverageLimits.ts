/** GMX leverage — unrestricted: all users get full GMX range */

export const MAX_LEVERAGE = 100;

export const LEVERAGE_CHIPS = [
  1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100,
] as const;

export function getMaxLeverageForPlan(_planTier?: string | null): number {
  return MAX_LEVERAGE;
}

export function getMaxLeverageLabel(_planTier?: string | null): string {
  return `${MAX_LEVERAGE}x`;
}

export function getLeverageChips(_planTier?: string | null): readonly number[] {
  return LEVERAGE_CHIPS;
}

export function clampLeverage(value: number, _planTier?: string | null): number {
  return Math.min(Math.max(1, value), MAX_LEVERAGE);
}
