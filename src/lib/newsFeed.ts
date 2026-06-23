import { getBotApiBase } from './signalService';

export type NewsAnalysisDto = {
  summary: string;
  bias: string;
  impact: string;
  confidence: number;
  affectedAssets: string[];
  horizon: string;
  priceHint: string;
  reasoning: string;
  suggestedAction: string;
};

export type NewsItemDto = {
  id: string;
  headline: string;
  source: string;
  publishedAt: string;
  url?: string;
  assets: string[];
  category: string;
  analysis: NewsAnalysisDto;
  analyzedAt: string;
  prognosis?: {
    eventName: string;
    favoredLeg: string;
    prognosisPct: number;
    reasoning: string;
    outcomeId?: number;
    questionId?: number;
  };
};

export async function fetchNewsFeed(tab: 'crypto' | 'sports', limit = 20): Promise<NewsItemDto[]> {
  const res = await fetch(
    `${getBotApiBase()}/api/news?tab=${encodeURIComponent(tab)}&limit=${limit}`
  );
  if (!res.ok) throw new Error('News feed unavailable');
  const data = (await res.json()) as { items?: NewsItemDto[] };
  return Array.isArray(data.items) ? data.items : [];
}
