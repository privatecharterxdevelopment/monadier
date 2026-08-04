import { getBotApiBase } from '../botApiFetch';

export async function fetchHlLetRunPrefs(
  wallet: string
): Promise<{ prefs: Record<string, boolean>; letRunAll: boolean }> {
  const base = getBotApiBase();
  if (!base || !wallet) return { prefs: {}, letRunAll: false };
  const res = await fetch(
    `${base}/api/hl-let-run?wallet=${encodeURIComponent(wallet.toLowerCase())}`
  );
  const data = (await res.json()) as {
    success?: boolean;
    prefs?: Record<string, boolean>;
    letRunAll?: boolean;
  };
  if (!res.ok || !data.success) return { prefs: {}, letRunAll: false };
  return {
    prefs: data.prefs ?? {},
    letRunAll: Boolean(data.letRunAll),
  };
}

export async function setHlLetRunPref(
  wallet: string,
  coin: string,
  letRun: boolean
): Promise<{ ok: boolean; error?: string }> {
  const base = getBotApiBase();
  if (!base) return { ok: false, error: 'Bot API unavailable' };
  try {
    const res = await fetch(`${base}/api/hl-let-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: wallet.toLowerCase(),
        coin: coin.toUpperCase(),
        letRun,
      }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) {
      return { ok: false, error: data.error || 'Failed to save let-run' };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save let-run',
    };
  }
}
