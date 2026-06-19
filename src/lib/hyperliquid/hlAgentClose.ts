import { getBotApiBase } from '../signalService';

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
    const raw = json.error || 'Close failed — try again in a few seconds.';
    if (/builder fee has not been approved/i.test(raw)) {
      throw new Error(
        'Close blocked by platform fee settings — retrying without fee. Hard-refresh the page (Cmd+Shift+R) and try again.'
      );
    }
    throw new Error(raw);
  }
}
