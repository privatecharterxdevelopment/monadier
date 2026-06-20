import type { HlBuilderOrderParam } from '../builder';
import { getHlBuilderConfig } from '../builderConfig';
import { parseMaxBuilderTenthsBps } from '../proTradeBuilderFee';
import type { OutcomeOrderSide } from './types';

export function isBuilderOrderError(message: string): boolean {
  return /builder|fee.*approv|approv.*fee|insufficient balance/i.test(message);
}

export function isBettingBuilderApprovalSufficient(approvedMaxTenthsBps: number): boolean {
  const config = getHlBuilderConfig();
  if (!config.enabled) return true;
  const cap = parseMaxBuilderTenthsBps(config.bettingMaxApprovalRate);
  const needed = Math.max(config.bettingBuyFeeTenthsBps, config.bettingCashoutFeeTenthsBps);
  return approvedMaxTenthsBps >= Math.max(cap, needed);
}

export function resolveOutcomeBuilderParam(opts: {
  orderSide: OutcomeOrderSide;
  approvedMaxTenthsBps: number;
}): HlBuilderOrderParam | null {
  const config = getHlBuilderConfig();
  if (!config.enabled || opts.approvedMaxTenthsBps <= 0) return null;

  const maxTenths = parseMaxBuilderTenthsBps(config.bettingMaxApprovalRate);
  const approvedCap = Math.min(opts.approvedMaxTenthsBps, maxTenths);
  const desired =
    opts.orderSide === 'buy' ? config.bettingBuyFeeTenthsBps : config.bettingCashoutFeeTenthsBps;

  if (desired <= 0 || approvedCap < desired) return null;
  return { b: config.address, f: desired };
}

export function formatBettingBuyFeeLabel(): string {
  const config = getHlBuilderConfig();
  return `${(config.bettingBuyFeeTenthsBps / 1000).toFixed(1)}%`;
}

export function formatBettingCashoutFeeLabel(): string {
  const config = getHlBuilderConfig();
  return `${(config.bettingCashoutFeeTenthsBps / 1000).toFixed(1)}%`;
}

export function estimateBettingPlatformFeeUsd(notionalUsd: number, orderSide: OutcomeOrderSide): number {
  if (notionalUsd <= 0) return 0;
  const config = getHlBuilderConfig();
  const tenths =
    orderSide === 'buy' ? config.bettingBuyFeeTenthsBps : config.bettingCashoutFeeTenthsBps;
  return (notionalUsd * tenths) / 100_000;
}
