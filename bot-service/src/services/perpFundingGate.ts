/**
 * Perp funding gate — open-time only. Funding can flip within seconds; range/24h checks
 * belong in scan (location) and are not re-evaluated at open.
 */
import { config } from '../config';
import { fetchPerpMarketContext } from './perpMarketContextGate';

export type PerpFundingResult = {
  ok: boolean;
  reason: string;
  funding: number | null;
};

export async function validatePerpFundingAtOpen(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<PerpFundingResult> {
  const cfg = config.hyperliquid.perpContext;

  try {
    const ctx = await fetchPerpMarketContext(opts.coin);
    if (!ctx) {
      return { ok: true, reason: 'Funding check — HL data pending', funding: null };
    }

    const funding = ctx.funding;
    const fundingPct = (funding * 100).toFixed(4);

    if (opts.direction === 'LONG' && funding >= cfg.maxLongFunding) {
      return {
        ok: false,
        reason: `LONG blocked — ${opts.coin} funding ${fundingPct}% (crowded longs)`,
        funding,
      };
    }

    if (opts.direction === 'SHORT' && funding <= -cfg.maxLongFunding) {
      return {
        ok: false,
        reason: `SHORT blocked — ${opts.coin} funding ${fundingPct}% (crowded shorts)`,
        funding,
      };
    }

    return {
      ok: true,
      reason: `Funding OK — ${opts.coin} ${fundingPct}%`,
      funding,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: true, reason: `Funding check skipped (${msg.slice(0, 40)})`, funding: null };
  }
}
