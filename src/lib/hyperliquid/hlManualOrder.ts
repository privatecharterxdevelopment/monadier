import { getBotApiBase } from '../signalService';
import type { OrderSide, SimpleOrderKind } from './orders';

type MarginMode = 'cross' | 'isolated';

async function postHlTradeApi<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
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
  if (!res.ok || !json.success) {
    const raw = (json.error ?? '').replace(/\s*-\s*null\s*$/i, '').trim();
    if (res.status === 429 || /429|too many requests/i.test(raw)) {
      throw new Error('Hyperliquid rate limit — wait ~30 seconds and retry.');
    }
    throw new Error(raw || 'Hyperliquid request failed');
  }
  return json as T;
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
