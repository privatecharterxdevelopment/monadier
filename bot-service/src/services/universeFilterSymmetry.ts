import { FUNNEL } from './pipelineFunnelReasons';

const MAJOR_COINS = new Set(['BTC', 'ETH']);

export type MacroRegime = 'risk_off' | 'risk_on' | 'neutral';

export type UniverseBlockInput = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  regime: MacroRegime;
  btcDirection?: 'LONG' | 'SHORT';
  ethDirection?: 'LONG' | 'SHORT';
  megaLongBlock: boolean;
  megaShortBlock: boolean;
};

/** Symmetric default-allow universe filter — single OR-blocker per direction for alts. */
export function computeAltUniverseBlock(input: UniverseBlockInput): string | null {
  const coin = input.coin.toUpperCase();
  if (MAJOR_COINS.has(coin)) return null;

  if (input.direction === 'LONG') {
    if (input.regime === 'risk_off') return FUNNEL.universe.riskOff;
    if (input.btcDirection === 'SHORT') return FUNNEL.universe.btcShort;
    if (input.ethDirection === 'SHORT') return FUNNEL.universe.ethShort;
    if (input.megaLongBlock) return FUNNEL.universe.megaOutflow;
    return null;
  }

  if (input.regime === 'risk_on') return FUNNEL.universe.riskOn;
  if (input.btcDirection === 'LONG') return FUNNEL.universe.btcLong;
  if (input.ethDirection === 'LONG') return FUNNEL.universe.ethLong;
  if (input.megaShortBlock) return FUNNEL.universe.megaInflow;
  return null;
}
