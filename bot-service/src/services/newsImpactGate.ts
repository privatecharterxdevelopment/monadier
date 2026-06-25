/**
 * News impact gate — macro shocks (Iran, war, etc.) affect BTC/ETH; full filter on all tiers.
 */
import { config } from '../config';
import { MAJOR_COINS } from './coinTier';
import type { CoinTier } from './coinTier';
import { fetchHeadlinesForCoin, fetchMacroHeadlines } from './newsFeedService';
import {
  analyzeHeadlinesHeuristic,
  analyzeNewsItem,
  isCriticalMacroHeadline,
} from './newsAnalyzerService';
import { normalizeNewsTradeMode, type NewsTradeMode } from './newsTradeMode';
import type { NewsBias, NewsGateResult, NewsImpact } from './newsTypes';

export type { CoinNewsResult } from './coinNewsGate';

function impactRank(impact: NewsImpact): number {
  if (impact === 'critical') return 4;
  if (impact === 'high') return 3;
  if (impact === 'medium') return 2;
  return 1;
}

function mergeAnalysis(
  coinHeadlines: string[],
  macroHeadlines: string[],
  coin: string
): { headlines: string[]; bias: NewsBias; impact: NewsImpact; confidence: number } {
  const headlines = [...macroHeadlines, ...coinHeadlines].slice(0, 12);
  const assets = MAJOR_COINS.has(coin) ? [coin, 'BTC', 'ETH'] : [coin];
  const analysis = analyzeHeadlinesHeuristic(headlines, assets);

  for (const h of headlines) {
    if (isCriticalMacroHeadline(h)) {
      return {
        headlines,
        bias: 'risk_off',
        impact: 'critical',
        confidence: Math.max(analysis.confidence, 78),
      };
    }
  }

  return {
    headlines,
    bias: analysis.bias,
    impact: analysis.impact,
    confidence: analysis.confidence,
  };
}

function blocksDirection(
  direction: 'LONG' | 'SHORT',
  bias: NewsBias,
  impact: NewsImpact,
  mode: NewsTradeMode
): boolean {
  if (impact === 'low' && mode === 'off') return false;

  if (bias === 'risk_off') {
    if (direction === 'LONG' && impactRank(impact) >= 2) return true;
    if (direction === 'SHORT' && impact === 'critical') return false;
  }

  if (mode === 'off') {
    return bias === 'risk_off' && direction === 'LONG' && impactRank(impact) >= 3;
  }

  if (direction === 'LONG' && (bias === 'bearish' || bias === 'risk_off') && impactRank(impact) >= 2) {
    return true;
  }
  if (direction === 'SHORT' && bias === 'bullish' && impactRank(impact) >= 2) {
    return true;
  }
  if (mode === 'filter' && bias === 'unknown' && impactRank(impact) >= 2 && config.hyperliquid.news.blockUnknownHeadlines) {
    return true;
  }

  return false;
}

function newsBoost(
  direction: 'LONG' | 'SHORT',
  bias: NewsBias,
  impact: NewsImpact,
  mode: NewsTradeMode
): number {
  if (mode !== 'boost') return 0;
  if (impactRank(impact) < 2) return 0;
  if (direction === 'LONG' && bias === 'bullish') return impact === 'high' ? 12 : 8;
  if (direction === 'SHORT' && (bias === 'bearish' || bias === 'risk_off')) {
    return impact === 'critical' ? 15 : 10;
  }
  return 0;
}

export async function validateNewsImpact(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  tier: CoinTier;
  newsTradeMode?: NewsTradeMode | string | null;
}): Promise<NewsGateResult> {
  const coin = opts.coin.toUpperCase();
  const mode = normalizeNewsTradeMode(opts.newsTradeMode ?? 'filter');
  const cfg = config.hyperliquid.news;

  const [coinHeadlines, macroItems] = await Promise.all([
    fetchHeadlinesForCoin(coin),
    fetchMacroHeadlines(),
  ]);
  const macroHeadlines = macroItems.map((m) => m.headline);

  const merged = mergeAnalysis(coinHeadlines, macroHeadlines, coin);
  const { headlines, bias, impact, confidence } = merged;
  const criticalMacro = impact === 'critical' || macroHeadlines.some(isCriticalMacroHeadline);
  const boostConfidence = newsBoost(opts.direction, bias, impact, mode);

  const macroNote =
    criticalMacro && MAJOR_COINS.has(coin)
      ? `Macro shock — ${coin} risk-off gate active`
      : criticalMacro
        ? `Macro shock — majors affected; ${coin} gate`
        : null;

  if (blocksDirection(opts.direction, bias, impact, mode)) {
    const lead = headlines[0] ?? 'recent headlines';
    return {
      ok: false,
      reason:
        macroNote ??
        `${opts.direction} blocked — ${coin} news ${bias} (${impact}): ${lead.slice(0, 120)}`,
      headlines,
      sentiment: bias,
      impact,
      confidence,
      boostConfidence: 0,
      criticalMacro,
    };
  }

  const summary =
    headlines.length > 0
      ? `News OK — ${headlines.length} headline(s), ${bias} (${impact})${boostConfidence ? ` · +${boostConfidence}% news boost` : ''}`
      : 'News OK — no recent catalyst headlines';

  return {
    ok: true,
    reason: macroNote ? `${macroNote} · ${summary}` : summary,
    headlines,
    sentiment: bias,
    impact,
    confidence,
    boostConfidence,
    criticalMacro,
  };
}

/** Feed API — analyze crypto items with optional LLM. */
export async function buildCryptoNewsFeed(limit = 20) {
  const { fetchCryptoNewsFeed, listActiveNewsSources, getCachedCryptoFeedAgeMs } = await import(
    './newsFeedService'
  );
  const cfg = config.hyperliquid.news;
  const items = (await fetchCryptoNewsFeed()).slice(0, limit);
  const out: Awaited<ReturnType<typeof analyzeNewsItem>>[] = new Array(items.length);
  const concurrency = cfg.analysisConcurrency;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      const item = items[i];
      const analysis = await analyzeNewsItem(item);
      out[i] = analysis;
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));

  const analyzed = items.map((item, i) => ({
    ...item,
    analysis: out[i],
    analyzedAt: new Date().toISOString(),
  }));

  const aiCount = analyzed.filter((r) => r.analysis.engine === 'openai').length;
  const feedAge = getCachedCryptoFeedAgeMs();

  return {
    items: analyzed,
    meta: {
      sources: listActiveNewsSources(),
      feedFetchedAt: feedAge != null ? new Date(Date.now() - feedAge).toISOString() : new Date().toISOString(),
      analyzedAt: new Date().toISOString(),
      analysisEngine: aiCount > 0 ? ('openai' as const) : ('rules' as const),
      aiAnalyzedCount: aiCount,
      rulesAnalyzedCount: analyzed.length - aiCount,
      hasOpenAi: Boolean(cfg.openaiApiKey),
    },
  };
}
