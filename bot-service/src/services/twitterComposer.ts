import { createClient } from '@supabase/supabase-js';
import { BRAND_NAME, BRAND_SITE_URL } from '../brand';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export type BotSocialStats = {
  activeBots: number;
  closes24h: number;
  wins24h: number;
  grossPnl24h: number;
  winRate24h: number | null;
  topCoins: string[];
  generatedAt: string;
};

export async function gatherBotSocialStats(): Promise<BotSocialStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: activeBots }, { data: closes }] = await Promise.all([
    supabase
      .from('vault_settings')
      .select('id', { count: 'exact', head: true })
      .eq('auto_trade_enabled', true),
    supabase
      .from('trade_history')
      .select('token_symbol, profit_loss, closed_at')
      .eq('execution_venue', 'hyperliquid')
      .not('closed_at', 'is', null)
      .gte('closed_at', since)
      .limit(500),
  ]);

  const rows = closes ?? [];
  let wins24h = 0;
  let grossPnl24h = 0;
  const coinPnl = new Map<string, number>();

  for (const row of rows) {
    const pnl = Number(row.profit_loss) || 0;
    grossPnl24h += pnl;
    if (pnl > 0) wins24h += 1;
    const coin = String(row.token_symbol ?? '').toUpperCase();
    if (coin) coinPnl.set(coin, (coinPnl.get(coin) ?? 0) + pnl);
  }

  const closes24h = rows.length;
  const topCoins = [...coinPnl.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c]) => c);

  return {
    activeBots: activeBots ?? 0,
    closes24h,
    wins24h,
    grossPnl24h: Math.round(grossPnl24h * 100) / 100,
    winRate24h: closes24h > 0 ? Math.round((wins24h / closes24h) * 1000) / 10 : null,
    topCoins,
    generatedAt: new Date().toISOString(),
  };
}

function fallbackTweet(stats: BotSocialStats, siteUrl: string): string {
  const wr =
    stats.winRate24h != null ? `${stats.winRate24h}% win rate` : 'live Hyperliquid perps';
  const pnl =
    stats.closes24h > 0
      ? ` · 24h closes ${stats.closes24h}`
      : ` · ${stats.activeBots} bots online`;
  const coins = stats.topCoins.length ? ` · watching ${stats.topCoins.join(', ')}` : '';
  const base = `${BRAND_NAME}: AI trading bot on Hyperliquid${pnl}${coins}. ${wr}.`;
  const withUrl = `${base} ${siteUrl}`;
  return withUrl.length <= 280 ? withUrl : base.slice(0, 277) + '…';
}

async function openaiTweet(stats: BotSocialStats, siteUrl: string): Promise<string | null> {
  const key = config.hyperliquid.news.openaiApiKey;
  if (!key) return null;

  const model = config.twitter.openaiModel || config.hyperliquid.news.openaiModel;
  const prompt = {
    brand: BRAND_NAME,
    site: siteUrl,
    stats,
    rules: [
      'Write ONE tweet under 260 chars (leave room for link).',
      'Tone: sharp, credible, crypto-native — not hype-bro or guarantee language.',
      'Never promise profits, ROI, or "easy money".',
      'You may cite active bots, 24h close count, win rate, top coins — only from stats.',
      'No emojis overload (0–2 max). No hashtag spam (0–2).',
      'Do not invent numbers. If closes24h is 0, talk about the bot being live / scanning.',
      'End with the site URL once.',
      'Return JSON: { "text": "..." }',
    ],
  };

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You write concise X/Twitter posts for a Hyperliquid trading product. Never fabricate metrics.',
          },
          { role: 'user', content: JSON.stringify(prompt) },
        ],
      }),
    });
    if (!res.ok) {
      logger.debug('twitter OpenAI compose failed', { status: res.status });
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as { text?: string };
    const text = String(parsed.text ?? '').trim();
    if (!text) return null;
    return text.length > 280 ? text.slice(0, 277) + '…' : text;
  } catch (err: unknown) {
    logger.debug('twitter OpenAI compose error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function composeBotTweet(opts?: {
  siteUrl?: string | null;
}): Promise<{ body: string; stats: BotSocialStats; engine: 'openai' | 'template' }> {
  const stats = await gatherBotSocialStats();
  const siteUrl = (opts?.siteUrl || BRAND_SITE_URL).replace(/\/$/, '');
  const ai = await openaiTweet(stats, siteUrl);
  if (ai) return { body: ai, stats, engine: 'openai' };
  return { body: fallbackTweet(stats, siteUrl), stats, engine: 'template' };
}
