import { notifyHlTradeExecuted } from './hlInfoClient';
import { getBotApiBase } from '../signalService';
import { clearHlInfoCache, clearHlUserInfoCache } from './hlInfoClient';
import { requestTradeNotificationRefresh } from '../tradeNotificationEvents';
import type { OrderSide, SimpleOrderKind } from './orders';

type MarginMode = 'cross' | 'isolated';

async function postHlTradeApi<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const maxAttempts = 5;
  let lastErr = 'Hyperliquid request failed';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(`${getBotApiBase()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      // Never auto-retry an order after a timeout — it may already have filled.
      if (err instanceof Error && /timeout|timed out|abort/i.test(`${err.name} ${err.message}`)) {
        throw new Error('Server antwortet nicht (20s). Bitte Positionen prüfen, bevor du erneut klickst.');
      }
      throw err;
    }
    let json: { success?: boolean; error?: string | null } = {};
    try {
      json = (await res.json()) as { success?: boolean; error?: string | null };
    } catch {
      json = {};
    }
    if (res.ok && json.success) {
      const wallet = typeof body.wallet === 'string' ? body.wallet.toLowerCase() : '';
      if (wallet) clearHlUserInfoCache(wallet);
      clearHlInfoCache();
      requestTradeNotificationRefresh();
      return json as T;
    }
    const raw = (json.error ?? '').replace(/\s*-\s*null\s*$/i, '').trim();
    lastErr = raw || 'Hyperliquid request failed';
    const rateLimited =
      res.status === 429 ||
      /429|too many requests|rate limit|HL_RATE_LIMIT/i.test(raw);
    if (rateLimited && attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 800 + attempt * 700));
      continue;
    }
    if (rateLimited) {
      throw new Error(
        `Hyperliquid Rate-Limit (${res.status}): ${raw || 'Too many requests'} — Positionen in ~15s prüfen, bevor du erneut klickst.`
      );
    }
    throw new Error(lastErr);
  }
  throw new Error(lastErr);
}

export async function placeHlManualPerpOrderViaAgent(opts: {
  walletAddress: string;
  coin: string;
  side: OrderSide;
  kind: SimpleOrderKind;
  size: number;
  price?: number;
  markPx: number;
  leverage?: number;
  marginMode?: MarginMode;
  reduceOnly?: boolean;
  /** Default false — manual perp with no AI profit trail. Set true only for bot-managed agent opens. */
  botManaged?: boolean;
}): Promise<void> {
  await postHlTradeApi('/api/hl-order', {
    wallet: opts.walletAddress.toLowerCase(),
    coin: opts.coin,
    side: opts.side,
    kind: opts.kind,
    size: opts.size,
    price: opts.price,
    markPx: opts.markPx,
    leverage: opts.leverage,
    marginMode: opts.marginMode ?? 'isolated',
    reduceOnly: opts.reduceOnly ?? false,
    botManaged: opts.botManaged === true,
    scope: opts.botManaged ? 'bot' : 'manual',
  });
  notifyHlTradeExecuted(opts.walletAddress.toLowerCase());
}

export async function updateHlManualPerpLeverageViaAgent(opts: {
  walletAddress: string;
  coin: string;
  leverage: number;
  marginMode: MarginMode;
}): Promise<void> {
  await postHlTradeApi('/api/hl-leverage', {
    wallet: opts.walletAddress.toLowerCase(),
    coin: opts.coin,
    leverage: opts.leverage,
    marginMode: opts.marginMode,
  });
}
