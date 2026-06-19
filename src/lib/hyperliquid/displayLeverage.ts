import { toNum } from './parse';

/** Show saved bot leverage when set; otherwise HL position leverage. */
export function resolveDisplayLeverage(
  configuredLeverage: number | undefined,
  positionLeverage: unknown
): number {
  const configured =
    configuredLeverage != null && Number.isFinite(configuredLeverage) && configuredLeverage > 0
      ? configuredLeverage
      : 0;
  const onChain = toNum(positionLeverage);
  if (configured > 0) return configured;
  return onChain > 0 ? onChain : 1;
}
