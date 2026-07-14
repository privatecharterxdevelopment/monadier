type BotStopSaver = (
  stopLossPct: number
) => Promise<{ ok: boolean; error?: string }>;

let saver: BotStopSaver | null = null;

/** Dock registers so chart drag can persist the same bot SL %. */
export function registerBotStopSaver(fn: BotStopSaver): () => void {
  saver = fn;
  return () => {
    if (saver === fn) saver = null;
  };
}

export async function commitBotStopLossPct(
  stopLossPct: number
): Promise<{ ok: boolean; error?: string }> {
  if (!saver) {
    return { ok: false, error: 'Stop saver not ready — open Bot panel once.' };
  }
  return saver(stopLossPct);
}
