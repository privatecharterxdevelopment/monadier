import { formatUserBlocker } from './botReadiness';
import { shortScanBlockReason } from './hlScanCycleDisplay';
import type { HlScanSkip } from './hlScanCycleDisplay';

export type BotAnalysisJournalEntry = {
  at: number;
  coin?: string;
  verdict: string;
  detail: string;
};

const JOURNAL_MS = 10 * 60_000;

export function pruneJournal(entries: BotAnalysisJournalEntry[], now = Date.now()): BotAnalysisJournalEntry[] {
  return entries.filter((e) => now - e.at < JOURNAL_MS);
}

export function journalVerdict(lines: string[]): string {
  const blob = lines.join(' ').toLowerCase();
  if (/insufficient margin|notional below|deposit/i.test(blob)) return 'Margin / funds';
  if (/opening trade|executing|waiting confirmation/i.test(blob)) return 'Opening';
  if (/blocked|gate|scalp|waiting for \d+m|not aligned/i.test(blob)) return 'Gated';
  if (/no hl pair|meets entry|no pair passed|no setup/i.test(blob)) return 'No entry yet';
  if (/scanning|checking|reading market/i.test(blob)) return 'Scanning';
  return 'Update';
}

type NarrativeInput = {
  coin?: string;
  signalDirection?: string;
  signalConfidence?: number;
  entryWaitReason?: string | null;
  blockers?: string[];
  candidateReason?: string | null;
  candidateCoin?: string | null;
  candidateDirection?: string | null;
  candidateConfidence?: number | null;
  readinessHeadline?: string;
  readinessDetail?: string;
  scanSkips?: HlScanSkip[];
  lastOpenError?: string | null;
};

/** Full engine copy for the Analysis side panel — not shown under the chart. */
export function buildBotAnalysisNarrative(input: NarrativeInput): string {
  const parts: string[] = [];

  const coin = input.coin?.toUpperCase();
  if (coin && input.signalDirection && input.signalConfidence != null) {
    parts.push(
      `${coin} ${input.signalDirection.toUpperCase()} ${Math.round(input.signalConfidence)}% (chart pair MTF)`
    );
  }

  if (input.entryWaitReason?.trim()) parts.push(input.entryWaitReason.trim());

  if (input.candidateCoin && input.candidateReason?.trim()) {
    const c = input.candidateCoin.toUpperCase();
    const d = input.candidateDirection?.toUpperCase() ?? '';
    const conf =
      input.candidateConfidence != null ? `${Math.round(input.candidateConfidence)}% ` : '';
    parts.push(`${c} ${d} ${conf}— ${input.candidateReason.trim()}`);
  }

  for (const raw of input.blockers ?? []) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const friendly = formatUserBlocker(trimmed);
    if (friendly && !parts.includes(friendly)) parts.push(friendly);
    else if (!friendly && !parts.includes(trimmed)) parts.push(trimmed);
  }

  if (input.lastOpenError?.trim()) {
    const line = `Last open: ${input.lastOpenError.trim()}`;
    if (!parts.some((p) => p.includes(input.lastOpenError!.trim()))) parts.push(line);
  }

  const detail = input.readinessDetail?.trim();
  const headline = input.readinessHeadline?.trim();
  if (detail && !parts.includes(detail)) parts.push(detail);
  else if (headline && headline !== 'Bot is reading market…' && !parts.includes(headline)) {
    parts.push(headline);
  }

  const skipLines = (input.scanSkips ?? [])
    .slice(-8)
    .map((s) => {
      const c = s.coin?.toUpperCase() ?? '?';
      return `${c}: ${shortScanBlockReason(s.reason)}`;
    });
  if (skipLines.length > 0) {
    parts.push(`Scan skips — ${skipLines.join(' · ')}`);
  }

  return [...new Set(parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean))].join('\n');
}

export function appendJournalEntry(
  prev: BotAnalysisJournalEntry[],
  entry: Omit<BotAnalysisJournalEntry, 'at'> & { at?: number },
  now = Date.now()
): BotAnalysisJournalEntry[] {
  const detail = entry.detail.trim();
  if (!detail) return pruneJournal(prev, now);

  const at = entry.at ?? now;
  const pruned = pruneJournal(prev, now);
  const last = pruned[pruned.length - 1];
  if (last && last.detail === detail && at - last.at < 3500) return pruned;

  return [...pruned, { at, coin: entry.coin, verdict: entry.verdict, detail }].slice(-160);
}

export function formatJournalTime(ms: number, timeZone = 'Asia/Dubai'): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ms));
}