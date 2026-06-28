import { getBotApiBase } from '../signalService';
import { waitForHlPositionClosed } from './hlCloseVerify';
import { clearHlInfoCache } from './hlInfoClient';

export async function closeHlPositionViaAgent(params: {
  walletAddress: string;
  coin: string;
}): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const coin = params.coin.toUpperCase();
  const res = await fetch(`${getBotApiBase()}/api/hl-close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, coin, reason: 'manual' }),
  });
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Close failed — try again.');
  }

  clearHlInfoCache();
  const flat = await waitForHlPositionClosed(wallet, coin);
  if (!flat) {
    throw new Error(
      `Close not confirmed on Hyperliquid — ${coin} may still be open. Check app.hyperliquid.xyz.`
    );
  }
}
