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
  const text = item.headline;
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
    bias = item.category === 'sports' ? 'neutral' : 'unknown';
  }

  let impact: NewsImpact = 'low';
  if (CRITICAL_MACRO_RE.test(text)) impact = 'critical';
  else if (HIGH_IMPACT_RE.test(text) || bear >= 3 || bull >= 2) impact = 'high';
  else if (bear >= 1 || bull >= 1 || item.category === 'sports') impact = 'medium';

  const confidence = Math.min(
    92,
    48 +
      (impact === 'critical' ? 35 : impact === 'high' ? 22 : impact === 'medium' ? 12 : 4) +
      Math.abs(bull - bear) * 8
  );

  let suggestedAction: NewsAnalysis['suggestedAction'] = 'NONE';
  if (bias === 'risk_off' || (bias === 'bearish' && impact !== 'low')) {
    suggestedAction = item.category === 'crypto' ? 'SHORT' : 'WAIT';
  } else if (bias === 'bullish' && impact !== 'low') {
    suggestedAction = 'LONG';
  } else if (bias === 'bearish') {
    suggestedAction = 'FADE';
  } else {
    suggestedAction = 'WAIT';
  }

  const move =
    impact === 'critical'
      ? '2–8% risk-off move on majors'
      : impact === 'high'
        ? '1–4% move likely'
        : impact === 'medium'
          ? '0.5–2% drift'
          : 'minimal drift';

  const priceHint =
    item.category === 'sports'
      ? 'Check matched betting market — odds may shift on this headline'
      : `${item.assets.slice(0, 3).join('/')} — ${move} (${bias})`;

  const reasoning =
    bias === 'risk_off'
      ? 'Geopolitical / macro shock — flight to safety; BTC/ETH often dip on risk-off.'
      : bias === 'bullish'
        ? 'Positive catalyst language — upside bias short-term.'
        : bias === 'bearish'
          ? 'Negative catalyst — fade rallies or wait for sweep low.'
          : item.category === 'sports'
            ? INJURY_RE.test(text)
              ? 'Player availability shift — reprice match odds.'
              : WIN_RE.test(text)
                ? 'Result / form signal — momentum for winner side.'
                : 'Sports headline — match to open betting markets.'
            : 'No strong directional keyword — wait for technical zone.';

  return {
    summary: text.length > 120 ? `${text.slice(0, 117)}…` : text,
    bias,
    impact,
    confidence,
    affectedAssets: item.assets,
    horizon: horizonFromImpact(impact),
    priceHint,
    reasoning,
    suggestedAction,
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
              'You are a crypto and sports trading analyst. Return JSON only with keys: summary, bias (bullish|bearish|neutral|risk_off|unknown), impact (low|medium|high|critical), confidence (0-100), affectedAssets (string array), horizon (1h|4h|24h), priceHint, reasoning, suggestedAction (LONG|SHORT|WAIT|FADE|NONE). For sports, focus on match outcome probability shifts.',
          },
          {
            role: 'user',
            content: `Category: ${item.category}\nHeadline: ${item.headline}\nAssets: ${item.assets.join(', ')}`,
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
