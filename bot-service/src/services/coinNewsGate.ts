/**
 * News first on cautious alts — then technical analysis decides direction.
 * Does NOT ban SHORT; blocks when headlines + pump risk disagree with the trade.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { needsCautionPath, type CoinTier } from './coinTier';

export type CoinNewsResult = {
  ok: boolean;
  reason: string;
  tier: CoinTier;
  headlines: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'unknown';
};

type CacheRow = {
  at: number;
  headlines: string[];
  sentiment: CoinNewsResult['sentiment'];
};

const cache = new Map<string, CacheRow>();

const BULLISH_RE =
  /\b(launch|partnership|list(ing|ed)?|integrat(e|ion)|upgrade|mainnet|airdrop|token(?:omics)?|invest(?:ment|s)?|fund(?:ing|raise)?|approv(ed|al)|unveil|announce|collaborat|grant|milestone|surge|rally|soar|record high|etf|buyback)\b/i;

const BEARISH_RE =
  /\b(hack|exploit|breach|sec\b|lawsuit|delist|bankrupt|delay|halt|crash|fraud|investigat|scam|rug|dump|layoff|shutdown|warning|fine\b|subpoena|arrest)\b/i;

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

async function resolveCoingeckoId(coin: string): Promise<string | null> {
  const key = coin.toUpperCase();
  if (COINGECKO_ID[key]) return COINGECKO_ID[key];
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(key.toLowerCase())}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      coins?: { id: string; symbol: string }[];
    };
    return (
      data.coins?.find((c) => c.symbol?.toUpperCase() === key)?.id ?? data.coins?.[0]?.id ?? null
    );
  } catch {
    return null;
  }
}

function sentimentFromHeadlines(headlines: string[]): CoinNewsResult['sentiment'] {
  if (headlines.length === 0) return 'neutral';
  let bull = 0;
  let bear = 0;
  for (const h of headlines) {
    if (BULLISH_RE.test(h)) bull += 1;
    if (BEARISH_RE.test(h)) bear += 1;
  }
  if (bull > bear && bull > 0) return 'bullish';
  if (bear > bull && bear > 0) return 'bearish';
  if (bull === 0 && bear === 0) return 'unknown';
  return 'neutral';
}

async function fetchHeadlines(coin: string): Promise<string[]> {
  const cfg = config.hyperliquid.cautiousNews;
  const cached = cache.get(coin.toUpperCase());
  if (cached && Date.now() - cached.at < cfg.cacheMs) {
    return cached.headlines;
  }

  const headlines: string[] = [];

  if (cfg.cryptopanicToken) {
    try {
      const url =
        `https://cryptopanic.com/api/v1/posts/?auth_token=${encodeURIComponent(cfg.cryptopanicToken)}` +
        `&currencies=${encodeURIComponent(coin.toUpperCase())}&filter=important&public=true`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = (await res.json()) as {
          results?: { title?: string; published_at?: string }[];
        };
        const cutoff = Date.now() - cfg.lookbackMs;
        for (const row of data.results ?? []) {
          const title = row.title?.trim();
          if (!title) continue;
          const ts = row.published_at ? Date.parse(row.published_at) : 0;
          if (ts > 0 && ts < cutoff) continue;
          headlines.push(title);
          if (headlines.length >= cfg.maxHeadlines) break;
        }
      }
    } catch (err) {
      logger.warn('CryptoPanic fetch failed', {
        coin,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (headlines.length === 0) {
    const id = await resolveCoingeckoId(coin);
    if (id) {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/coins/${id}/status_updates?per_page=${cfg.maxHeadlines}`,
          { headers: { Accept: 'application/json' } }
        );
        if (res.ok) {
          const rows = (await res.json()) as {
            status_updates?: { description?: string; created_at?: string }[];
          };
          const cutoff = Date.now() - cfg.lookbackMs;
          for (const row of rows.status_updates ?? []) {
            const text = row.description?.trim();
            if (!text) continue;
            const ts = row.created_at ? Date.parse(row.created_at) : 0;
            if (ts > 0 && ts < cutoff) continue;
            headlines.push(text.slice(0, 240));
            if (headlines.length >= cfg.maxHeadlines) break;
          }
        }
      } catch (err) {
        logger.warn('CoinGecko news fetch failed', {
          coin,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const sentiment = sentimentFromHeadlines(headlines);
  cache.set(coin.toUpperCase(), { at: Date.now(), headlines, sentiment });
  return headlines;
}

function cachedRow(coin: string): CacheRow | undefined {
  return cache.get(coin.toUpperCase());
}

/** Step 1 on cautious alts: read headlines before any technical open. */
export async function validateCoinNews(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  tier: CoinTier;
}): Promise<CoinNewsResult> {
  const coin = opts.coin.toUpperCase();
  const cfg = config.hyperliquid.cautiousNews;

  if (!needsCautionPath(opts.tier)) {
    return {
      ok: true,
      reason: 'News — mid/major tier; technical analysis leads',
      tier: opts.tier,
      headlines: [],
      sentiment: 'neutral',
    };
  }

  await fetchHeadlines(coin);
  const row = cachedRow(coin);
  const headlines = row?.headlines ?? [];
  const sentiment = row?.sentiment ?? 'neutral';

  if (headlines.length > 0 && sentiment === 'unknown' && cfg.blockUnknownHeadlines) {
    return {
      ok: false,
      reason:
        `News unclear — ${coin}: recent headlines but unknown catalyst (wait) — ` +
        headlines.slice(0, 2).join(' | '),
      tier: opts.tier,
      headlines,
      sentiment,
    };
  }

  if (opts.direction === 'SHORT' && sentiment === 'bullish') {
    return {
      ok: false,
      reason: `SHORT wait — ${coin} has bullish news; check pump cooldown before fading: ${headlines[0] ?? ''}`,
      tier: opts.tier,
      headlines,
      sentiment,
    };
  }

  if (opts.direction === 'LONG' && sentiment === 'bearish') {
    return {
      ok: false,
      reason: `LONG wait — ${coin} bearish news: ${headlines[0] ?? ''}`,
      tier: opts.tier,
      headlines,
      sentiment,
    };
  }

  const summary =
    headlines.length > 0
      ? `News checked — ${headlines.length} headline(s), ${sentiment}; proceed to technical analysis`
      : 'News checked — no recent catalyst headlines; proceed to technical analysis';

  return { ok: true, reason: summary, tier: opts.tier, headlines, sentiment };
}
