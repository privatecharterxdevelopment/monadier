import { getBotApiBase } from './signalService';
import { decodeHtmlEntities } from './decodeHtmlEntities';

export type NewsAnalysisDto = {
  summary: string;
  bias: string;
  impact: string;
  confidence: number;
  primaryAsset?: string | null;
  affectedAssets: string[];
  horizon: string;
  priceHint: string;
  reasoning: string;
  suggestedAction: string;
  engine?: 'openai' | 'rules';
};

export type NewsItemDto = {
  id: string;
  headline: string;
  source: string;
  publishedAt: string;
  url?: string;
  snippet?: string;
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

export type NewsFeedMeta = {
  sources: string[];
  feedFetchedAt: string;
  analyzedAt: string;
  analysisEngine: 'openai' | 'rules';
  aiAnalyzedCount: number;
  rulesAnalyzedCount: number;
  hasOpenAi: boolean;
};

export type NewsFeedResponse = {
  items: NewsItemDto[];
  meta?: NewsFeedMeta;
};

function sanitizeNewsItem(item: NewsItemDto): NewsItemDto {
  const a = item.analysis;
  return {
    ...item,
    headline: decodeHtmlEntities(item.headline),
    snippet: item.snippet != null ? decodeHtmlEntities(item.snippet) : item.snippet,
    analysis: {
      ...a,
      summary: decodeHtmlEntities(a.summary),
      priceHint: decodeHtmlEntities(a.priceHint),
      reasoning: decodeHtmlEntities(a.reasoning),
    },
    prognosis: item.prognosis
      ? {
          ...item.prognosis,
          eventName: decodeHtmlEntities(item.prognosis.eventName),
          favoredLeg: decodeHtmlEntities(item.prognosis.favoredLeg),
          reasoning: decodeHtmlEntities(item.prognosis.reasoning),
        }
      : item.prognosis,
  };
}

export async function fetchNewsFeed(
  tab: 'crypto' | 'sports',
  limit = 24
): Promise<NewsFeedResponse> {
  const res = await fetch(
    `${getBotApiBase()}/api/news?tab=${encodeURIComponent(tab)}&limit=${limit}`
  );
  if (!res.ok) throw new Error('News feed unavailable');
  const data = (await res.json()) as NewsFeedResponse & { items?: NewsItemDto[] };
  const items = Array.isArray(data.items) ? data.items.map(sanitizeNewsItem) : [];
  return {
    items,
    meta: data.meta,
  };
}
