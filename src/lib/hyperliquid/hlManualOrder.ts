import { getBotApiBase } from '../signalService';
import type { OrderSide, SimpleOrderKind } from './orders';

type MarginMode = 'cross' | 'isolated';

async function postHlTradeApi<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const maxAttempts = 5;
  let lastErr = 'Hyperliquid request failed';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const res = await fetch(`${getBotApiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let json: { success?: boolean; error?: string | null } = {};
    try {
      json = (await res.json()) as { success?: boolean; error?: string | null };
    } catch {
      json = {};
    }
    if (res.ok && json.success) {
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
        'Hyperliquid busy — order may still land. Check positions in ~15s before tapping again.'
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
  /** Counts as agent position (profit trail, dock, chart markers). */
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
