export type NewsImpact = 'low' | 'medium' | 'high' | 'critical';
export type NewsBias = 'bullish' | 'bearish' | 'neutral' | 'risk_off' | 'unknown';
export type NewsHorizon = '1h' | '4h' | '24h';
export type NewsTradeMode = 'off' | 'filter' | 'boost';

export type NewsItem = {
  id: string;
  headline: string;
  source: string;
  publishedAt: string;
  url?: string;
  snippet?: string;
  assets: string[];
  category: 'crypto' | 'macro' | 'sports';
};

export type NewsAnalysis = {
  summary: string;
  bias: NewsBias;
  impact: NewsImpact;
  confidence: number;
  /** Single HL perp most tied to this headline — null = macro / no clean coin edge. */
  primaryAsset: string | null;
  affectedAssets: string[];
  horizon: NewsHorizon;
  priceHint: string;
  reasoning: string;
  suggestedAction: 'LONG' | 'SHORT' | 'WAIT' | 'FADE' | 'NONE';
  /** openai = LLM pass; rules = keyword desk scan (fallback). */
  engine: 'openai' | 'rules';
};

export type AnalyzedNewsItem = NewsItem & {
  analysis: NewsAnalysis;
  analyzedAt: string;
};

export type SportsPrognosis = {
  eventName: string;
  favoredLeg: string;
  prognosisPct: number;
  reasoning: string;
  outcomeId?: number;
  questionId?: number;
};

export type AnalyzedSportsNewsItem = NewsItem & {
  analysis: NewsAnalysis;
  prognosis?: SportsPrognosis;
  analyzedAt: string;
};

export type NewsGateResult = {
  ok: boolean;
  reason: string;
  headlines: string[];
  sentiment: NewsBias;
  impact: NewsImpact;
  confidence: number;
  boostConfidence: number;
  criticalMacro: boolean;
};
