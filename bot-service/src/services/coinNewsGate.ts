/**
 * News gate — delegates to newsImpactGate (BTC/ETH + macro + all tiers).
 */
import type { CoinTier } from './coinTier';
import { validateNewsImpact } from './newsImpactGate';
import type { NewsBias, NewsImpact } from './newsTypes';
import type { NewsTradeMode } from './newsTradeMode';

export type CoinNewsResult = {
  ok: boolean;
  reason: string;
  tier: CoinTier;
  headlines: string[];
  sentiment: NewsBias;
  impact?: NewsImpact;
  boostConfidence?: number;
};

export async function validateCoinNews(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  tier: CoinTier;
  newsTradeMode?: NewsTradeMode | string | null;
}): Promise<CoinNewsResult> {
  const result = await validateNewsImpact({
    coin: opts.coin,
    direction: opts.direction,
    tier: opts.tier,
    newsTradeMode: opts.newsTradeMode,
  });

  return {
    ok: result.ok,
    reason: result.reason,
    tier: opts.tier,
    headlines: result.headlines,
    sentiment: result.sentiment,
    impact: result.impact,
    boostConfidence: result.boostConfidence,
  };
}
