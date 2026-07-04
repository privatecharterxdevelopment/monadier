/** When false, chart/dock analyzer must not spin or show live MTF signals. */
export function isBotEntryBlocked(opts: {
  botRunning: boolean;
  canTrade?: boolean | null;
  blockers: string[];
  lastOpenError?: string | null;
  slotsFull?: boolean;
}): boolean {
  if (!opts.botRunning) return true;
  if (opts.slotsFull) return false;
  if (opts.canTrade === false) return true;
  if (opts.lastOpenError?.trim()) return true;
  return opts.blockers.some((b) =>
    /Last open attempt|Last open:|Entry blocked|Funding\/24h range|Price at bad level|Chart still trending|Pair still pumping|Volume gate blocked|BTC\+ETH outflow blocks|No tradeable setup|Bot fees due|Approve the trading agent|platform fee/i.test(
      b
    )
  );
}

export function botAnalyzerPausedCopy(opts: {
  botRunning: boolean;
  entryBlocked: boolean;
  blockers: string[];
  lastOpenError?: string | null;
}): { title: string; detail: string } {
  if (!opts.botRunning) {
    return { title: 'Bot off', detail: 'Press Start bot to scan markets.' };
  }
  if (!opts.entryBlocked) {
    return { title: 'Bot is reading market…', detail: '' };
  }
  const last =
    opts.lastOpenError?.trim() ||
    opts.blockers.find((b) => /Last open attempt|Last open:/i.test(b)) ||
    opts.blockers.find((b) => b.trim()) ||
    'Entry blocked — bot waits before scanning again.';
  return { title: 'Bot paused', detail: last.replace(/^Last open attempt \(\w+\):\s*/i, 'Last open: ') };
}
