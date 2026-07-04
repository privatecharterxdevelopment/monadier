import { formatUserBlocker } from './botReadiness';

const HARD_BLOCKER =
  /trading agent|platform fee|Bot fees due|Approve the|Must deposit|margin too small|free margin too low|notional.*below min|linked to another/i;

const TRANSIENT_OPEN_RETRY =
  /Funding\/24h range|Price at bad level|Chart still trending|Pair still pumping|Volume gate blocked|needs live momentum|Dip-buy|Rally-fade/i;

/** Only stop the live analyzer for off-state or hard user gates — not “no setup yet”. */
export function isBotEntryBlocked(opts: {
  botRunning: boolean;
  blockers: string[];
  lastOpenError?: string | null;
  slotsFull?: boolean;
}): boolean {
  if (!opts.botRunning) return true;
  if (opts.slotsFull) return false;

  const last = opts.lastOpenError?.trim();
  if (last && !TRANSIENT_OPEN_RETRY.test(last)) return true;

  return opts.blockers.some((b) => HARD_BLOCKER.test(b));
}

/** One consistent status line while the bot is on. */
export function botAnalyzerStatusCopy(opts: {
  botRunning: boolean;
  blockers: string[];
  lastOpenError?: string | null;
  slotsFull?: boolean;
  openCount?: number;
  maxSlots?: number;
}): { title: string; detail: string } {
  if (!opts.botRunning) {
    return { title: 'Bot off', detail: 'Press Start bot to scan markets.' };
  }

  if (opts.slotsFull) {
    const n = opts.openCount ?? opts.maxSlots ?? 2;
    const max = opts.maxSlots ?? n;
    return {
      title: `${n}/${max} · all slots filled`,
      detail: 'Monitoring open positions — scan pauses until a slot opens.',
    };
  }

  const formatted = [...opts.blockers, ...(opts.lastOpenError ? [`Last open: ${opts.lastOpenError}`] : [])]
    .map(formatUserBlocker)
    .filter(Boolean);
  const unique = [...new Set(formatted)];
  const hard = unique.filter((b) => HARD_BLOCKER.test(b));

  if (hard.length > 0) {
    return { title: 'Bot waiting', detail: hard.join(' · ') };
  }

  const soft = unique.filter((b) => !HARD_BLOCKER.test(b));
  const detail = soft.join(' · ');
  return { title: 'Bot is reading market…', detail };
}
