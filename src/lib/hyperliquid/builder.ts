import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import type { HlMarketKind } from '../../hooks/useHyperliquidMarket';
import type { OrderSide } from './orders';
import { getHlBuilderConfig } from './builderConfig';

const transport = new HttpTransport();
const info = new InfoClient({ transport });

export type HlBuilderOrderParam = {
  b: `0x${string}`;
  f: number;
};

export async function fetchMaxBuilderFee(
  user: string,
  builder: string
): Promise<number> {
  try {
    const fee = await info.maxBuilderFee({
      user: user as `0x${string}`,
      builder: builder as `0x${string}`,
    });
    return Number(fee) || 0;
  } catch {
    return 0;
  }
}

export function resolveBuilderOrderParam(opts: {
  marketKind: HlMarketKind;
  side: OrderSide;
  approvedMaxTenthsBps: number;
}): HlBuilderOrderParam | null {
  const config = getHlBuilderConfig();
  if (!config.enabled) return null;

  if (opts.marketKind === 'spot' && opts.side === 'long') {
    return null;
  }

  const desired =
    opts.marketKind === 'spot' ? config.feeSpotSell : config.feePerp;

  if (desired <= 0 || opts.approvedMaxTenthsBps < desired) return null;

  return { b: config.address, f: desired };
}

export function isBuilderApprovalSufficient(approvedMaxTenthsBps: number): boolean {
  const config = getHlBuilderConfig();
  if (!config.enabled) return true;
  const m = config.maxApprovalRate.match(/([\d.]+)/);
  const maxTenths = m ? Math.floor(parseFloat(m[1]) * 1000) : 100;
  return approvedMaxTenthsBps >= maxTenths;
}
