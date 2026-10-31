import { config } from '../config';
import { logger } from '../utils/logger';
import type { NewsAnalysis, NewsBias, NewsHorizon, NewsImpact, NewsItem } from './newsTypes';

type AnalysisCache = { at: number; analysis: NewsAnalysis };

const cache = new Map<string, AnalysisCache>();

const MAJOR_TICKERS = new Set(['BTC', 'ETH']);

const BULLISH_RE =
  /\b(launch|partnership|list(ing|ed)?|integrat(e|ion)|upgrade|mainnet|airdrop|etf approv|invest(?:ment|s)?|fund(?:ing|raise)?|surge|rally|soar|record high|buyback|inflow)\b/i;

const BEARISH_RE =
  /\b(hack|exploit|breach|sec sue|lawsuit|delist|bankrupt|delay|halt|crash|fraud|investigat|scam|rug|dump|layoff|shutdown|fine\b|subpoena|arrest|outflow|loss|losses|drawdown|liquidat|capitulat|bloodbath|bear market|crypto winter|selloff|plunge|tumble)\b/i;

const MARKET_CRASH_RE =
  /\b(biggest|largest|worst|record).{0,48}(loss|decline|drop|selloff|drawdown|liquidation|dump)|since 20(1\d|2[0-5])|largest loss|biggest loss|worst (day|week|month|quarter|year)|steepest (drop|decline|fall)|mass liquidation/i;

const CRITICAL_MACRO_RE =
  /\b(war|attack|missile|strike|invasion|iran|israel|hamas|hezbollah|nuclear|terror|assassination|martial law|state of emergency|world war|nato|embargo)\b/i;

const HIGH_IMPACT_RE =
  /\b(etf|sec\b|fed\b|rate hike|rate cut|cpi|inflation|recession|sanctions|exchange hack|binance|coinbase|treasury|ban crypto|outage|liquidat)\b/i;

const RISK_OFF_RE =
  /\b(fear|uncertainty|selloff|plunge|tumble|risk.?off|geopolitical|oil spike|safe haven|flight to|black swan)\b/i;

export const INJURY_RE =
  /\b(ruled out|injury|injured|doubtful|sidelined|out for|will miss|hamstring|acl|suspended|absent)\b/i;

export const WIN_RE = /\b(wins?|defeats?|beats?|victory|advances?|qualifies?|champions?)\b/i;

const ASSET_NAME_RE: Record<string, RegExp> = {
  BTC: /\b(bitcoin|btc)\b/i,
  ETH: /\b(ethereum|ether|eth)\b/i,
  SOL: /\b(solana|sol)\b/i,
  XRP: /\b(ripple|xrp)\b/i,
  DOGE: /\b(dogecoin|doge)\b/i,
  AVAX: /\b(avalanche|avax)\b/i,
  LINK: /\b(chainlink|link)\b/i,
  UNI: /\b(uniswap|uni)\b/i,
  ARB: /\b(arbitrum|arb)\b/i,
  OP: /\b(optimism|op)\b/i,
  SUI: /\b(sui)\b/i,
  INJ: /\b(injective|inj)\b/i,
  HYPE: /\b(hyperliquid|hype)\b/i,
};

function impactRank(impact: NewsImpact): number {
  if (impact === 'critical') return 4;
  if (impact === 'high') return 3;
  if (impact === 'medium') return 2;
  return 1;
}

function horizonFromImpact(impact: NewsImpact): NewsHorizon {
  if (impact === 'critical' || impact === 'high') return '4h';
  if (impact === 'medium') return '4h';
  return '24h';
}

function itemText(item: NewsItem): string {
  return `${item.headline} ${item.snippet ?? ''}`;
}

function assetMentionScore(text: string, asset: string): number {
  const upper = asset.toUpperCase();
  let score = 0;
  if (new RegExp(`\\b${upper}\\b`).test(text)) score += 2;
  if (ASSET_NAME_RE[upper]?.test(text)) score += 4;
  return score;
}

/** Pick the one coin this headline is actually about — never "BTC/ETH" as a pair. */
export function pickPrimaryAsset(item: NewsItem): string | null {
  const text = itemText(item);
  const assets = [...new Set(item.assets.map((a) => a.toUpperCase()).filter(Boolean))];
  if (assets.length === 0) return null;
  if (assets.length === 1) return assets[0];

  const alts = assets.filter((a) => !MAJOR_TICKERS.has(a));
  if (alts.length === 1) return alts[0];

  const scored = assets
    .map((asset) => ({ asset, score: assetMentionScore(text, asset) }))
    .sort((a, b) => b.score - a.score);

  if (scored[0].score > 0) return scored[0].asset;

  if (item.category === 'macro') return null;

  if (alts.length > 0) return alts[0];

  if (/\b(ethereum|ether)\b/i.test(text) && !/\b(bitcoin|btc)\b/i.test(text)) return 'ETH';
  if (/\b(bitcoin|btc)\b/i.test(text)) return 'BTC';

  return scored[0]?.asset ?? null;
}

function orderAffectedAssets(primary: string | null, item: NewsItem): string[] {
  const assets = [...new Set(item.assets.map((a) => a.toUpperCase()).filter(Boolean))];
  if (!primary) return assets.slice(0, 4);
  return [primary, ...assets.filter((a) => a !== primary)].slice(0, 4);
}

function resolveSuggestedAction(
  item: NewsItem,
  primary: string | null,
  bias: NewsBias,
  impact: NewsImpact,
  confidence: number
): NewsAnalysis['suggestedAction'] {
  if (item.category === 'sports') return 'WAIT';

  if (!primary) {
    if (item.category === 'macro' && impactRank(impact) >= 2) return 'WAIT';
    return impact === 'low' ? 'NONE' : 'WAIT';
  }

  if (impact === 'low') return 'NONE';
  if (bias === 'neutral' || bias === 'unknown') return 'WAIT';

  if (bias === 'risk_off') {
    return impactRank(impact) >= 2 ? 'SHORT' : 'WAIT';
  }
  if (bias === 'bearish') {
    if (impact === 'critical' || impact === 'high') return 'SHORT';
    return 'FADE';
  }
  if (bias === 'bullish') {
    if (impact === 'critical' || impact === 'high') return 'LONG';
    if (impact === 'medium' && confidence >= 58) return 'LONG';
    return 'WAIT';
  }

  return 'WAIT';
}

function buildPriceHint(
  item: NewsItem,
  primary: string | null,
  impact: NewsImpact,
  _bias: NewsBias
): string {
  if (item.category === 'sports') return 'Reprice matched outcome odds';

  if (!primary) {
    if (item.category === 'macro') {
      if (impact === 'critical') return 'Macro risk-off — cross-asset volatility; no single-coin edge';
      if (impact === 'high') return 'Macro headline — watch majors for direction; avoid random alt punts';
      if (impact === 'medium') return 'Macro noise — low conviction for directional perp trades';
      return 'Macro headline — minimal expected drift';
    }
    return 'No specific asset — wait for price to react';
  }

  const move =
    impact === 'critical'
      ? `${primary} often −2% to −6% on risk-off (hours) if macro-driven`
      : impact === 'high'
        ? `${primary} ±1–3% drift possible (4–24h) if headline is ${primary}-specific`
        : impact === 'medium'
          ? `${primary} ±0.3–1.2% — confirm zone before entry`
          : `${primary} — headline likely noise; minimal drift`;

  return move;
}

function buildReasoning(
  item: NewsItem,
  primary: string | null,
  bias: NewsBias,
  impact: NewsImpact
): string {
  if (item.category === 'sports') {
    const text = itemText(item);
    if (INJURY_RE.test(text)) {
      return 'Availability change — shift win probability toward the healthy side.';
    }
    if (WIN_RE.test(text)) {
      return 'Form/result signal — short-term momentum for the named side.';
    }
    return 'Match-related headline — check linked betting market.';
  }

  if (!primary) {
    if (item.category === 'macro') {
      return 'Broad macro/geopolitical headline — affects correlation across crypto; do not auto-punt BTC on every war/Fed headline.';
    }
    return 'No clear single asset in headline — treat as low edge until price confirms.';
  }

  if (bias === 'risk_off') {
    return `${primary} may lead risk-off if this is a macro shock; only SHORT ${primary} if it is directly implicated — not "trade BTC because news exists".`;
  }
  if (bias === 'bullish') {
    return `${primary}-specific positive catalyst — confirm ${primary} chart is not already extended before LONG.`;
  }
  if (bias === 'bearish') {
    return `Negative ${primary} headline — prefer SHORT/fade ${primary} near resistance or wait for sweep.`;
  }
  if (impact === 'low') {
    return `${primary} mentioned but weak keyword signal — desk rates this low conviction.`;
  }
  return `${primary} headline — neutral read; wait for price reaction.`;
}

function heuristicAnalysis(item: NewsItem): NewsAnalysis {
  const text = itemText(item);
  let bull = 0;
  let bear = 0;
  if (BULLISH_RE.test(text)) bull += 1;
  if (BEARISH_RE.test(text)) bear += 1;
  if (RISK_OFF_RE.test(text)) bear += 2;
  if (CRITICAL_MACRO_RE.test(text)) bear += 3;
  if (MARKET_CRASH_RE.test(text)) bear += 4;

  let bias: NewsBias = 'neutral';
  if (CRITICAL_MACRO_RE.test(text) || (RISK_OFF_RE.test(text) && bear > bull)) {
    bias = 'risk_off';
  } else if (bull > bear && bull > 0) {
    bias = 'bullish';
  } else if (bear > bull && bear > 0) {
    bias = 'bearish';
  }

  let impact: NewsImpact = 'low';
  if (CRITICAL_MACRO_RE.test(text) || MARKET_CRASH_RE.test(text)) impact = 'critical';
  else if (HIGH_IMPACT_RE.test(text) || bear >= 3 || bull >= 2) impact = 'high';
  else if (bear >= 1 || bull >= 1 || item.category === 'sports') impact = 'medium';

  const confidence = Math.min(
    72,
    42 +
      (impact === 'critical' ? 22 : impact === 'high' ? 14 : impact === 'medium' ? 8 : 2) +
      Math.abs(bull - bear) * 6
  );

  const primary = pickPrimaryAsset(item);
  const suggestedAction = resolveSuggestedAction(item, primary, bias, impact, confidence);
  const priceHint = buildPriceHint(item, primary, impact, bias);
  const reasoning = buildReasoning(item, primary, bias, impact);

  const summary =
    item.snippet && item.snippet.length > 40 && item.snippet !== item.headline
      ? item.snippet.slice(0, 200)
      : item.headline.length > 120
        ? `${item.headline.slice(0, 117)}…`
        : item.headline;

  return {
    summary,
    bias,
    impact,
    confidence,
    primaryAsset: primary,
    affectedAssets: orderAffectedAssets(primary, item),
    horizon: horizonFromImpact(impact),
    priceHint,
    reasoning,
    suggestedAction,
    engine: 'rules',
  };
}

const LLM_SYSTEM_PROMPT =
  'You are a senior crypto/macro trading desk analyst. Be realistic and conservative — most headlines are LOW impact. ' +
  'Rules: (1) Pick exactly ONE primaryAsset ticker (BTC, ETH, SOL, etc.) that the headline is actually about — never return "BTC/ETH" as a pair. ' +
  '(2) If the headline is generic macro (war, Fed, CPI, geopolitics) with no specific coin, set primaryAsset to null, affectedAssets to [], suggestedAction WAIT, impact low/medium unless truly market-moving. ' +
  '(3) Only suggest LONG/SHORT when the headline clearly names or implicates that specific coin — do not default every story to BTC. ' +
  '(4) priceHint must reference only primaryAsset (or explain macro cross-asset risk if primaryAsset is null) — never "BTC/ETH ±X%". ' +
  '(5) Confidence rarely above 80. Return JSON: summary, bias (bullish|bearish|neutral|risk_off|unknown), impact (low|medium|high|critical), confidence (0-100), primaryAsset (string|null), affectedAssets (string[]), horizon (1h|4h|24h), priceHint, reasoning, suggestedAction (LONG|SHORT|WAIT|FADE|NONE), engine ("openai").';

function sanitizePriceHint(hint: string, primary: string | null): string {
  let out = hint.replace(/BTC\s*\/\s*ETH/gi, primary ?? 'majors');
  if (primary && /\bBTC\b.*\bETH\b/i.test(out) && !out.includes(primary)) {
    out = out.replace(/\bBTC\b/g, primary).replace(/\bETH\b/g, primary);
  }
  return out.slice(0, 280);
}

function normalizeLlmAnalysis(item: NewsItem, parsed: Partial<NewsAnalysis>): NewsAnalysis {
  const rawAssets = Array.isArray(parsed.affectedAssets)
    ? parsed.affectedAssets.map((a) => String(a).toUpperCase()).filter(Boolean)
    : item.assets;

  const mergedItem: NewsItem = {
    ...item,
    assets: rawAssets.length > 0 ? rawAssets : item.assets,
  };

  let primary: string | null = null;
  if (parsed.primaryAsset != null && String(parsed.primaryAsset).trim()) {
    primary = String(parsed.primaryAsset).toUpperCase();
  } else {
    primary = pickPrimaryAsset(mergedItem);
  }

  const bias = (parsed.bias as NewsBias) ?? 'unknown';
  const impact = (parsed.impact as NewsImpact) ?? 'medium';
  const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 60));

  const suggestedAction =
    (parsed.suggestedAction as NewsAnalysis['suggestedAction']) ??
    resolveSuggestedAction(mergedItem, primary, bias, impact, confidence);

  const action =
    !primary && (suggestedAction === 'LONG' || suggestedAction === 'SHORT')
      ? 'WAIT'
      : suggestedAction;

  return {
    summary: String(parsed.summary ?? item.headline).slice(0, 280),
    bias,
    impact,
    confidence,
    primaryAsset: primary,
    affectedAssets: orderAffectedAssets(primary, mergedItem),
    horizon: (parsed.horizon as NewsHorizon) ?? '4h',
    priceHint: sanitizePriceHint(
      String(parsed.priceHint ?? buildPriceHint(mergedItem, primary, impact, bias)),
      primary
    ),
    reasoning: String(parsed.reasoning ?? buildReasoning(mergedItem, primary, bias, impact)).slice(
      0,
      420
    ),
    suggestedAction: action,
    engine: 'openai',
  };
}

async function llmAnalysis(item: NewsItem): Promise<NewsAnalysis | null> {
  const cfg = config.hyperliquid.news;
  if (!cfg.openaiApiKey) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.openaiModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: LLM_SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              `Source: ${item.source}\nCategory: ${item.category}\nHeadline: ${item.headline}\n` +
              (item.snippet ? `Snippet: ${item.snippet}\n` : '') +
              `Detected tickers (may be empty): ${item.assets.join(', ') || 'none'}`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NewsAnalysis>;
    return normalizeLlmAnalysis(item, parsed);
  } catch (err) {
    logger.warn('LLM news analysis failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function analyzeNewsItem(item: NewsItem): Promise<NewsAnalysis> {
  const cached = cache.get(item.id);
  if (cached && Date.now() - cached.at < config.hyperliquid.news.analysisCacheMs) {
    return cached.analysis;
  }

  const llm = await llmAnalysis(item);
  const analysis = llm ?? heuristicAnalysis(item);
  cache.set(item.id, { at: Date.now(), analysis });
  return analysis;
}

export function analyzeHeadlinesHeuristic(headlines: string[], assets: string[]): NewsAnalysis {
  if (headlines.length === 0) {
    return {
      summary: 'No recent headlines',
      bias: 'neutral',
      impact: 'low',
      confidence: 50,
      primaryAsset: assets[0] ?? null,
      affectedAssets: assets,
      horizon: '24h',
      priceHint: 'No catalyst',
      reasoning: 'No news — technical zones lead.',
      suggestedAction: 'NONE',
      engine: 'rules',
    };
  }

  const joined = headlines.join(' · ');
  let worst: NewsAnalysis | null = null;
  for (const headline of headlines.slice(0, 10)) {
    const item: NewsItem = {
      id: `batch:${headline.slice(0, 32)}`,
      headline,
      source: 'aggregate',
      publishedAt: new Date().toISOString(),
      assets,
      category:
        CRITICAL_MACRO_RE.test(joined) || MARKET_CRASH_RE.test(joined) ? 'macro' : 'crypto',
    };
    const analysis = heuristicAnalysis(item);
    if (
      !worst ||
      impactRank(analysis.impact) > impactRank(worst.impact) ||
      (analysis.bias === 'risk_off' && worst.bias !== 'risk_off') ||
      (analysis.bias === 'bearish' &&
        worst.bias !== 'bearish' &&
        worst.bias !== 'risk_off' &&
        impactRank(analysis.impact) >= impactRank(worst.impact))
    ) {
      worst = analysis;
    }
  }
  return worst ?? heuristicAnalysis({
    id: 'batch',
    headline: headlines[0],
    source: 'aggregate',
    publishedAt: new Date().toISOString(),
    assets,
    category: 'crypto',
  });
}

export function isCriticalMacroHeadline(text: string): boolean {
  return (
    CRITICAL_MACRO_RE.test(text) ||
    MARKET_CRASH_RE.test(text) ||
    (RISK_OFF_RE.test(text) && HIGH_IMPACT_RE.test(text))
  );
}

export { CRITICAL_MACRO_RE };
