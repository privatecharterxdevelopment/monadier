import { config } from '../config';
import { logger } from '../utils/logger';
import type { NewsAnalysis, NewsBias, NewsHorizon, NewsImpact, NewsItem } from './newsTypes';

type AnalysisCache = { at: number; analysis: NewsAnalysis };

const cache = new Map<string, AnalysisCache>();

const BULLISH_RE =
  /\b(launch|partnership|list(ing|ed)?|integrat(e|ion)|upgrade|mainnet|airdrop|etf approv|invest(?:ment|s)?|fund(?:ing|raise)?|surge|rally|soar|record high|buyback|inflow)\b/i;

const BEARISH_RE =
  /\b(hack|exploit|breach|sec sue|lawsuit|delist|bankrupt|delay|halt|crash|fraud|investigat|scam|rug|dump|layoff|shutdown|fine\b|subpoena|arrest|outflow)\b/i;

const CRITICAL_MACRO_RE =
  /\b(war|attack|missile|strike|invasion|iran|israel|hamas|hezbollah|nuclear|terror|assassination|martial law|state of emergency|world war|nato|embargo)\b/i;

const HIGH_IMPACT_RE =
  /\b(etf|sec\b|fed\b|rate hike|rate cut|cpi|inflation|recession|sanctions|exchange hack|binance|coinbase|treasury|ban crypto|outage|liquidat)\b/i;

const RISK_OFF_RE =
  /\b(fear|uncertainty|selloff|plunge|tumble|risk.?off|geopolitical|oil spike|safe haven|flight to|black swan)\b/i;

export const INJURY_RE =
  /\b(ruled out|injury|injured|doubtful|sidelined|out for|will miss|hamstring|acl|suspended|absent)\b/i;

export const WIN_RE = /\b(wins?|defeats?|beats?|victory|advances?|qualifies?|champions?)\b/i;

function horizonFromImpact(impact: NewsImpact): NewsHorizon {
  if (impact === 'critical' || impact === 'high') return '4h';
  if (impact === 'medium') return '4h';
  return '24h';
}

function heuristicAnalysis(item: NewsItem): NewsAnalysis {
  const text = `${item.headline} ${item.snippet ?? ''}`;
  let bull = 0;
  let bear = 0;
  if (BULLISH_RE.test(text)) bull += 1;
  if (BEARISH_RE.test(text)) bear += 1;
  if (RISK_OFF_RE.test(text)) bear += 2;
  if (CRITICAL_MACRO_RE.test(text)) bear += 3;

  let bias: NewsBias = 'neutral';
  if (CRITICAL_MACRO_RE.test(text) || (RISK_OFF_RE.test(text) && bear > bull)) {
    bias = 'risk_off';
  } else if (bull > bear && bull > 0) {
    bias = 'bullish';
  } else if (bear > bull && bear > 0) {
    bias = 'bearish';
  } else if (bull === 0 && bear === 0) {
    bias = item.category === 'sports' ? 'neutral' : 'neutral';
  }

  let impact: NewsImpact = 'low';
  if (CRITICAL_MACRO_RE.test(text)) impact = 'critical';
  else if (HIGH_IMPACT_RE.test(text) || bear >= 3 || bull >= 2) impact = 'high';
  else if (bear >= 1 || bull >= 1 || item.category === 'sports') impact = 'medium';

  const confidence = Math.min(
    72,
    42 +
      (impact === 'critical' ? 22 : impact === 'high' ? 14 : impact === 'medium' ? 8 : 2) +
      Math.abs(bull - bear) * 6
  );

  let suggestedAction: NewsAnalysis['suggestedAction'] = 'NONE';
  if (bias === 'risk_off' || (bias === 'bearish' && impact !== 'low')) {
    suggestedAction = item.category === 'crypto' || item.category === 'macro' ? 'SHORT' : 'WAIT';
  } else if (bias === 'bullish' && impact !== 'low') {
    suggestedAction = 'LONG';
  } else if (bias === 'bearish') {
    suggestedAction = 'FADE';
  } else {
    suggestedAction = 'WAIT';
  }

  const majors = item.assets.filter((a) => ['BTC', 'ETH'].includes(a));
  const target = majors.length > 0 ? majors.join('/') : item.assets.slice(0, 2).join('/') || 'BTC';

  const move =
    impact === 'critical'
      ? `${target} often −2% to −6% on risk-off (hours)`
      : impact === 'high'
        ? `${target} ±1–3% drift likely (4–24h)`
        : impact === 'medium'
          ? `${target} ±0.3–1.2% — wait for zone confirmation`
          : `${target} — noise, minimal drift expected`;

  const priceHint = item.category === 'sports' ? 'Reprice matched outcome odds' : move;

  const reasoning =
    bias === 'risk_off'
      ? 'Macro/geopolitical shock — risk assets (BTC/ETH) often sell first; fade bounces only after sweep.'
      : bias === 'bullish'
        ? 'Positive catalyst — but confirm price is not already at pump high before LONG.'
        : bias === 'bearish'
          ? 'Negative headline — prefer SHORT fade near resistance or wait for sweep low.'
          : item.category === 'sports'
            ? INJURY_RE.test(text)
              ? 'Availability change — shift win probability toward the healthy side.'
              : WIN_RE.test(text)
                ? 'Form/result signal — short-term momentum for the named side.'
                : 'Match-related headline — check linked betting market.'
            : 'Desk scan: no strong keyword catalyst — treat as low conviction until price reacts.';

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
    affectedAssets: item.assets,
    horizon: horizonFromImpact(impact),
    priceHint,
    reasoning,
    suggestedAction,
    engine: 'rules',
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
          {
            role: 'system',
            content:
              'You are a senior crypto/macro trading desk analyst. Be realistic and conservative — most headlines are LOW impact. Only use high/critical for genuine market movers (war, ETF approval, exchange hack, Fed surprise). Confidence rarely above 80. Return JSON: summary (1-2 sentences), bias (bullish|bearish|neutral|risk_off|unknown), impact (low|medium|high|critical), confidence (0-100), affectedAssets (tickers), horizon (1h|4h|24h), priceHint (specific BTC/ETH % range if relevant), reasoning (trader-facing), suggestedAction (LONG|SHORT|WAIT|FADE|NONE), engine ("openai").',
          },
          {
            role: 'user',
            content:
              `Source: ${item.source}\nCategory: ${item.category}\nHeadline: ${item.headline}\n` +
              (item.snippet ? `Snippet: ${item.snippet}\n` : '') +
              `Assets: ${item.assets.join(', ')}`,
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
    return {
      summary: String(parsed.summary ?? item.headline).slice(0, 280),
      bias: (parsed.bias as NewsBias) ?? 'unknown',
      impact: (parsed.impact as NewsImpact) ?? 'medium',
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 60)),
      affectedAssets: Array.isArray(parsed.affectedAssets)
        ? parsed.affectedAssets.map((a) => String(a).toUpperCase())
        : item.assets,
      horizon: (parsed.horizon as NewsHorizon) ?? '4h',
      priceHint: String(parsed.priceHint ?? ''),
      reasoning: String(parsed.reasoning ?? ''),
      suggestedAction: (parsed.suggestedAction as NewsAnalysis['suggestedAction']) ?? 'WAIT',
      engine: 'openai',
    };
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
      affectedAssets: assets,
      horizon: '24h',
      priceHint: 'No catalyst',
      reasoning: 'No news — technical zones lead.',
      suggestedAction: 'NONE',
      engine: 'rules',
    };
  }

  const item: NewsItem = {
    id: 'batch',
    headline: headlines[0],
    source: 'aggregate',
    publishedAt: new Date().toISOString(),
    assets,
    category: CRITICAL_MACRO_RE.test(headlines.join(' ')) ? 'macro' : 'crypto',
  };
  return heuristicAnalysis(item);
}

export function isCriticalMacroHeadline(text: string): boolean {
  return CRITICAL_MACRO_RE.test(text) || (RISK_OFF_RE.test(text) && HIGH_IMPACT_RE.test(text));
}

export { CRITICAL_MACRO_RE };
