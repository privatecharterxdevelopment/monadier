/**
 * Watch public Hyperliquid wallets and alert when they OPEN a perp.
 * Alert only — never copies into the bot / never places orders.
 *
 * Targets = env HL_FOLLOW_WALLETS ∪ hl_followed_traders (per-user watchlist).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  fetchHlClearinghouseState,
  hlIsMeaningfulPerpPosition,
} from './hlInfo';

type FollowedBook = {
  coin: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPx: number;
};

type Follower = {
  userId: string;
  displayName: string | null;
};

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const seenByWallet = new Map<string, Map<string, FollowedBook>>();
const primed = new Set<string>();
let tickRunning = false;

const FOLLOWER_CACHE_MS = 15_000;
let followerCache: { at: number; byWallet: Map<string, Follower[]> } | null = null;

const MAX_WALLETS_PER_TICK = 80;

function bookKey(b: FollowedBook): string {
  return `${b.coin}:${b.side}`;
}

function parseBooks(state: Awaited<ReturnType<typeof fetchHlClearinghouseState>>): FollowedBook[] {
  const out: FollowedBook[] = [];
  for (const row of state?.assetPositions ?? []) {
    const coin = String(row.position?.coin ?? '')
      .toUpperCase()
      .replace(/-PERP$/i, '');
    const size = Number(row.position?.szi ?? 0);
    const entryPx = Number(row.position?.entryPx ?? 0);
    if (!coin || !hlIsMeaningfulPerpPosition(size, entryPx)) continue;
    out.push({
      coin,
      side: size > 0 ? 'LONG' : 'SHORT',
      size: Math.abs(size),
      entryPx,
    });
  }
  return out;
}

function truncateWallet(w: string): string {
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

function traderLabel(wallet: string, displayName: string | null | undefined): string {
  const name = displayName?.trim();
  return name || truncateWallet(wallet);
}

async function sendOpsFollowAlert(subject: string, html: string, text: string): Promise<void> {
  const to = config.email.followAlertTo;
  const apiKey = config.email.resendApiKey;
  if (!to || !apiKey) {
    logger.info('follow_wallet_open (no ops email configured)', { text: text.slice(0, 240) });
    return;
  }
  const from = config.email.from.includes('<')
    ? config.email.from
    : `HyperGain <${config.email.from}>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.warn('Follow-wallet ops alert email failed', {
      status: res.status,
      body: body.slice(0, 200),
    });
  }
}

async function loadFollowersByWallet(): Promise<Map<string, Follower[]>> {
  if (followerCache && Date.now() - followerCache.at < FOLLOWER_CACHE_MS) {
    return followerCache.byWallet;
  }
  const { data, error } = await supabase
    .from('hl_followed_traders')
    .select('user_id, wallet_address, display_name');
  const byWallet = new Map<string, Follower[]>();
  if (error) {
    logger.warn('hl_followed_traders load failed', { error: error.message });
  } else {
    for (const row of data ?? []) {
      const wallet = String(row.wallet_address ?? '').toLowerCase();
      const userId = String(row.user_id ?? '');
      if (!/^0x[a-f0-9]{40}$/.test(wallet) || !userId) continue;
      const list = byWallet.get(wallet) ?? [];
      list.push({
        userId,
        displayName: row.display_name != null ? String(row.display_name) : null,
      });
      byWallet.set(wallet, list);
    }
  }
  followerCache = { at: Date.now(), byWallet };
  return byWallet;
}

function walletsToPoll(byWallet: Map<string, Follower[]>): string[] {
  const set = new Set<string>([...config.followWallets, ...byWallet.keys()]);
  return [...set].slice(0, MAX_WALLETS_PER_TICK);
}

async function insertFollowerNotifications(
  wallet: string,
  book: FollowedBook,
  followers: Follower[]
): Promise<void> {
  if (followers.length === 0) return;
  const now = new Date().toISOString();
  const rows = followers.map((f) => {
    const label = traderLabel(wallet, f.displayName);
    return {
      user_id: f.userId,
      wallet_address: wallet,
      kind: 'follow',
      headline: `${label} opened ${book.side} ${book.coin}`,
      detail: `Size ${book.size} · entry ${book.entryPx}\nSignal only — HyperGain does not copy this trade.`,
      event_type: 'open',
      profit_loss: 0,
      closed_at: now,
    };
  });
  const { error } = await supabase.from('user_trade_notifications').insert(rows);
  if (error) {
    logger.warn('Follow-wallet user notification insert failed', {
      wallet: truncateWallet(wallet),
      error: error.message,
    });
  }
}

async function tickWallet(wallet: string, followers: Follower[]): Promise<void> {
  const state = await fetchHlClearinghouseState(wallet);
  const books = parseBooks(state);
  const next = new Map(books.map((b) => [bookKey(b), b]));

  if (!primed.has(wallet)) {
    seenByWallet.set(wallet, next);
    primed.add(wallet);
    logger.info('Follow-wallet primed (no backfill mail)', {
      wallet: truncateWallet(wallet),
      books: books.map(bookKey),
      followers: followers.length,
    });
    return;
  }

  const prev = seenByWallet.get(wallet) ?? new Map();
  const opened: FollowedBook[] = [];
  for (const [key, book] of next) {
    if (!prev.has(key)) opened.push(book);
  }
  seenByWallet.set(wallet, next);

  const isOpsWallet = config.followWallets.includes(wallet);

  for (const book of opened) {
    const label = traderLabel(wallet, followers[0]?.displayName);
    logger.info('follow_wallet_open', {
      wallet: truncateWallet(wallet),
      coin: book.coin,
      side: book.side,
      size: book.size,
      entryPx: book.entryPx,
      followers: followers.length,
    });

    if (isOpsWallet) {
      const subject = `HL follow ${label} opened ${book.side} ${book.coin}`;
      const text = `${label} opened ${book.side} ${book.coin} size ${book.size} @ ${book.entryPx}`;
      await sendOpsFollowAlert(
        subject,
        `<p><b>${label}</b> opened <b>${book.side} ${book.coin}</b></p>
<p>Size ${book.size} · entry ${book.entryPx}</p>
<p>Signal only — HyperGain bot does not copy this order.</p>`,
        text
      );
    }

    await insertFollowerNotifications(wallet, book, followers);
  }
}

export async function runFollowWalletAlertTick(): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const byWallet = await loadFollowersByWallet();
    const wallets = walletsToPoll(byWallet);
    if (wallets.length === 0) return;
    for (const wallet of wallets) {
      try {
        await tickWallet(wallet, byWallet.get(wallet) ?? []);
      } catch (err: unknown) {
        logger.warn('Follow-wallet tick failed', {
          wallet: truncateWallet(wallet),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    tickRunning = false;
  }
}
