import { config } from '../config';
import { logger } from '../utils/logger';
import type { NewsItem } from './newsTypes';

type CacheRow = { at: number; items: NewsItem[] };

const cache = new Map<string, CacheRow>();

const COINGECKO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  UNI: 'uniswap',
  SUI: 'sui',
  CELO: 'celo',
  LINK: 'chainlink',
  AVAX: 'avalanche-2',
  DOGE: 'dogecoin',
  XRP: 'ripple',
  NEAR: 'near',
  ARB: 'arbitrum',
  OP: 'optimism',
  APT: 'aptos',
  INJ: 'injective-protocol',
  TIA: 'celestia',
  WLD: 'worldcoin-wld',
  LDO: 'lido-dao',
  PENDLE: 'pendle',
  JUP: 'jupiter-exchange-solana',
  HYPE: 'hyperliquid',
};

const TICKER_RE = /\b(BTC|ETH|SOL|XRP|DOGE|BNB|ADA|AVAX|LINK|UNI|SUI|ARB|OP|APT|INJ|HYPE)\b/gi;

async function resolveCoingeckoId(coin: string): Promise<string | null> {
  const key = coin.toUpperCase();
  if (COINGECKO_ID[key]) return COINGECKO_ID[key];
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(key.toLowerCase())}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { coins?: { id: string; symbol: string }[] };
    return data.coins?.find((c) => c.symbol?.toUpperCase() === key)?.id ?? data.coins?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

function extractAssets(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(TICKER_RE)) {
    found.add(m[1].toUpperCase());
  }
  if (/\b(bitcoin|btc)\b/i.test(text)) found.add('BTC');
  if (/\b(ethereum|ether|eth)\b/i.test(text)) found.add('ETH');
  if (/\b(solana|sol)\b/i.test(text)) found.add('SOL');
  if (found.size === 0) {
    found.add('BTC');
    found.add('ETH');
  }
  return [...found];
}

function itemId(source: string, headline: string, at: string): string {
  return `${source}:${at}:${headline.slice(0, 48)}`.replace(/\s+/g, '_');
}

async function fetchCryptoPanicPosts(filter: 'important' | 'hot' = 'important'): Promise<NewsItem[]> {
  const cfg = config.hyperliquid.news;
  if (!cfg.cryptopanicToken) return [];

  const items: NewsItem[] = [];
  try {
    const url =
      `https://cryptopanic.com/api/v1/posts/?auth_token=${encodeURIComponent(cfg.cryptopanicToken)}` +
      `&filter=${filter}&public=true`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return items;

    const data = (await res.json()) as {
      results?: {
        title?: string;
        published_at?: string;
        url?: string;
        source?: { title?: string };
        currencies?: { code?: string }[];
      }[];
    };

    const cutoff = Date.now() - cfg.lookbackMs;
    for (const row of data.results ?? []) {
      const headline = row.title?.trim();
      if (!headline) continue;
      const ts = row.published_at ? Date.parse(row.published_at) : Date.now();
      if (ts > 0 && ts < cutoff) continue;
      const assets =
        row.currencies?.map((c) => c.code?.toUpperCase()).filter(Boolean) as string[] | undefined;
      items.push({
        id: itemId(row.source?.title ?? 'CryptoPanic', headline, String(ts)),
        headline,
        source: row.source?.title ?? 'CryptoPanic',
        publishedAt: new Date(ts).toISOString(),
        url: row.url,
        assets: assets && assets.length > 0 ? assets : extractAssets(headline),
        category: /\b(war|iran|israel|fed|sec|etf|inflation|attack|sanctions)\b/i.test(headline)
          ? 'macro'
          : 'crypto',
      });
      if (items.length >= cfg.maxFeedItems) break;
    }
  } catch (err) {
    logger.warn('CryptoPanic feed failed', { error: err instanceof Error ? err.message : String(err) });
  }
  return items;
}

async function fetchCoinGeckoStatus(coin: string): Promise<NewsItem[]> {
  const cfg = config.hyperliquid.news;
  const id = await resolveCoingeckoId(coin);
  if (!id) return [];

  const items: NewsItem[] = [];
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/status_updates?per_page=${cfg.maxHeadlines}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return items;

    const rows = (await res.json()) as {
      status_updates?: { description?: string; created_at?: string }[];
    };
    const cutoff = Date.now() - cfg.lookbackMs;
    for (const row of rows.status_updates ?? []) {
      const headline = row.description?.trim();
      if (!headline) continue;
      const ts = row.created_at ? Date.parse(row.created_at) : Date.now();
      if (ts > 0 && ts < cutoff) continue;
      items.push({
        id: itemId('CoinGecko', headline, String(ts)),
        headline: headline.slice(0, 280),
        source: 'CoinGecko',
        publishedAt: new Date(ts).toISOString(),
        assets: [coin.toUpperCase()],
        category: 'crypto',
      });
    }
  } catch {
    /* optional */
  }
  return items;
}

function parseRssItems(xml: string, source: string, category: NewsItem['category']): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks.slice(0, 12)) {
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim();
    if (!title) continue;
    const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim();
    const pub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim();
    const ts = pub ? Date.parse(pub) : Date.now();
    items.push({
      id: itemId(source, title, String(ts)),
      headline: title.replace(/<[^>]+>/g, ''),
      source,
      publishedAt: new Date(Number.isFinite(ts) ? ts : Date.now()).toISOString(),
      url: link,
      assets: extractAssets(title),
      category,
    });
  }
  return items;
}

async function fetchMacroRss(): Promise<NewsItem[]> {
  const feeds = [
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
    { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
  ];
  const out: NewsItem[] = [];
  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, { headers: { Accept: 'application/rss+xml' } });
      if (!res.ok) continue;
      const xml = await res.text();
      out.push(...parseRssItems(xml, feed.source, 'macro'));
    } catch {
      /* optional */
    }
  }
  return out;
}

export async function fetchSportsRssHeadlines(): Promise<NewsItem[]> {
  const feeds = [
    { url: 'https://feeds.bbci.co.uk/sport/rss.xml', source: 'BBC Sport' },
    { url: 'https://www.espn.com/espn/rss/news', source: 'ESPN' },
  ];
  const out: NewsItem[] = [];
  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, { headers: { Accept: 'application/rss+xml' } });
      if (!res.ok) continue;
      const xml = await res.text();
      out.push(...parseRssItems(xml, feed.source, 'sports'));
    } catch {
      /* optional */
    }
  }
  return out;
}

function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))) {
    const key = item.headline.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function fetchCryptoNewsFeed(): Promise<NewsItem[]> {
  const cfg = config.hyperliquid.news;
  const cacheKey = 'crypto-feed';
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < cfg.cacheMs) return cached.items;

  const [panic, macro, btc, eth] = await Promise.all([
    fetchCryptoPanicPosts('important'),
    fetchMacroRss(),
    fetchCoinGeckoStatus('BTC'),
    fetchCoinGeckoStatus('ETH'),
  ]);

  const items = dedupeNews([...panic, ...macro, ...btc, ...eth]);
  cache.set(cacheKey, { at: Date.now(), items });
  return items;
}

export async function fetchHeadlinesForCoin(coin: string): Promise<string[]> {
  const cfg = config.hyperliquid.news;
  const key = coin.toUpperCase();
  const cacheKey = `coin:${key}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < cfg.cacheMs) {
    return cached.items.map((i) => i.headline);
  }

  const feed = await fetchCryptoNewsFeed();
  const coinItems = feed.filter(
    (i) => i.assets.includes(key) || i.headline.toUpperCase().includes(key)
  );

  if (coinItems.length === 0 && cfg.cryptopanicToken) {
    try {
      const url =
        `https://cryptopanic.com/api/v1/posts/?auth_token=${encodeURIComponent(cfg.cryptopanicToken)}` +
        `&currencies=${encodeURIComponent(key)}&filter=important&public=true`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = (await res.json()) as { results?: { title?: string; published_at?: string }[] };
        const cutoff = Date.now() - cfg.lookbackMs;
        for (const row of data.results ?? []) {
          const title = row.title?.trim();
          if (!title) continue;
          const ts = row.published_at ? Date.parse(row.published_at) : Date.now();
          if (ts > 0 && ts < cutoff) continue;
          coinItems.push({
            id: itemId('CryptoPanic', title, String(ts)),
            headline: title,
            source: 'CryptoPanic',
            publishedAt: new Date(ts).toISOString(),
            assets: [key],
            category: 'crypto',
          });
        }
      }
    } catch {
      /* optional */
    }
  }

  if (coinItems.length === 0) {
    coinItems.push(...(await fetchCoinGeckoStatus(key)));
  }

  const items = dedupeNews(coinItems).slice(0, cfg.maxHeadlines);
  cache.set(cacheKey, { at: Date.now(), items });
  return items.map((i) => i.headline);
}

export async function fetchMacroHeadlines(): Promise<NewsItem[]> {
  const feed = await fetchCryptoNewsFeed();
  return feed.filter(
    (i) =>
      i.category === 'macro' ||
      /\b(war|attack|iran|israel|missile|invasion|sanctions|etf|sec|fed|cpi|inflation|hack|exploit)\b/i.test(
        i.headline
      )
  );
}
