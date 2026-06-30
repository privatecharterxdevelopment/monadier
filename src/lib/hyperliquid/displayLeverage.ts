import { toNum } from './parse';

/** Actual HL position leverage; configured bot setting is only a fallback before fill. */
export function resolveDisplayLeverage(
  configuredLeverage: number | undefined,
  positionLeverage: unknown
): number {
  const onChain = toNum(positionLeverage);
  if (onChain > 0) return onChain;
  const configured =
    configuredLeverage != null && Number.isFinite(configuredLeverage) && configuredLeverage > 0
      ? configuredLeverage
      : 0;
  if (configured > 0) return configured;
  return 1;
}
