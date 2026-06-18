import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import type { HlMarketKind } from '../../hooks/useHyperliquidMarket';
import type { OrderSide } from './orders';
import { getHlBuilderConfig } from './builderConfig';
import {
  parseMaxBuilderTenthsBps,
  successFeeToCloseBuilderTenthsBps,
} from './proTradeBuilderFee';

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

export function resolveProTradeBuilderParam(opts: {
  marketKind: HlMarketKind;
  side: OrderSide;
  approvedMaxTenthsBps: number;
  reduceOnly?: boolean;
  notionalUsd?: number;
  profitUsd?: number;
}): HlBuilderOrderParam | null {
  const config = getHlBuilderConfig();
  if (!config.enabled) return null;
  if (opts.approvedMaxTenthsBps <= 0) return null;

  const maxTenths = parseMaxBuilderTenthsBps(config.maxApprovalRate);
  const approvedCap = Math.min(opts.approvedMaxTenthsBps, maxTenths);

  if (opts.marketKind === 'spot') {
    if (opts.side !== 'short') return null;
    const desired = config.feeSpotSell;
    if (desired <= 0 || approvedCap < desired) return null;
    return { b: config.address, f: desired };
  }

  if (opts.reduceOnly) {
    const notional = opts.notionalUsd ?? 0;
    const profit = opts.profitUsd ?? 0;
    if (profit <= 0 || notional <= 0) return null;
    const f = successFeeToCloseBuilderTenthsBps(
      profit,
      notional,
      config.proTradeSuccessFeeBps,
      approvedCap
    );
    if (f <= 0) return null;
    return { b: config.address, f };
  }

  const openFee = config.feePerp;
  if (openFee <= 0 || approvedCap < openFee) return null;
  return { b: config.address, f: openFee };
}

/** @deprecated Use resolveProTradeBuilderParam */
export function resolveBuilderOrderParam(opts: {
  marketKind: HlMarketKind;
  side: OrderSide;
  approvedMaxTenthsBps: number;
}): HlBuilderOrderParam | null {
  return resolveProTradeBuilderParam(opts);
}

export function isBuilderApprovalSufficient(approvedMaxTenthsBps: number): boolean {
  const config = getHlBuilderConfig();
  if (!config.enabled) return true;
  const m = config.maxApprovalRate.match(/([\d.]+)/);
  const maxTenths = m ? Math.floor(parseFloat(m[1]) * 1000) : 100;
  return approvedMaxTenthsBps >= maxTenths;
}
