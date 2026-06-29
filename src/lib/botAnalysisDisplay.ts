import type { BotReadiness } from './botReadiness';
import { isBotScanNoiseDetail, sanitizeBotScanReason } from './hlBotReasonLabels';
import type { UnifiedSignal } from './signalService';

type GlobalBest = {
  coin: string;
  direction: string;
  confidence: number;
  reason?: string;
} | null;

type WhyLineInput = {
  globalBest?: GlobalBest;
  readiness?: BotReadiness;
  hasTfConflict: boolean;
  openPositionsCount: number;
  maxConcurrentPositions: number;
  pumpSweepLines?: string[];
  signal?: UnifiedSignal | null;
  scanningCoin?: string;
};

function formatTfSummary(signal: UnifiedSignal | null | undefined): string | null {
  if (!signal?.timeframes?.length) return null;
  return signal.timeframes
    .map((tf) => `${tf.timeframe} ${tf.direction} ${Math.round(tf.confidence)}%`)
    .join(' · ');
}

/** Primary analyzer subline — same copy as the chart analyzer strip. */
export function resolveBotAnalysisWhyLine({
  globalBest,
  readiness,
  hasTfConflict,
  openPositionsCount,
  maxConcurrentPositions,
  signal,
  scanningCoin,
}: WhyLineInput): string | null {
  if (globalBest?.reason?.trim()) {
    const conf = Math.round(globalBest.confidence);
    const slot =
      openPositionsCount > 0 && openPositionsCount < maxConcurrentPositions
        ? `Slot ${openPositionsCount + 1}: `
        : '';
    const cleanedReason = sanitizeBotScanReason(globalBest.reason.trim());
    if (!cleanedReason || isBotScanNoiseDetail(cleanedReason)) return null;
    const line = `${slot}${globalBest.coin} ${globalBest.direction} ${conf}% — ${cleanedReason}`;
    return isBotScanNoiseDetail(line) ? null : line;
  }
  const detail = readiness?.detail?.trim();
  if (detail && !isBotScanNoiseDetail(detail)) return detail;
  const tfSummary = formatTfSummary(signal);
  if (hasTfConflict) {
    const pair = scanningCoin ?? globalBest?.coin ?? 'This pair';
    if (tfSummary) {
      return `${pair}: ${tfSummary} — timeframes disagree; bot scans all HL perps for an aligned setup`;
    }
    return 'Chart timeframes on this pair disagree — bot still scans all HL perps for an aligned setup elsewhere.';
  }
  if (tfSummary && scanningCoin) {
    return `Checking ${scanningCoin}: ${tfSummary}`;
  }
  return null;
}

const REDUNDANT_HEADLINES = new Set([
  'Bot waiting',
  'Bot off',
  'Opening trade',
  'Entry blocked',
  'Bot active',
]);

/** User-facing insight lines for the positions dock scan panel. */
export function collectBotScanInsightLines(input: WhyLineInput): string[] {
  const lines: string[] = [];
  const why = resolveBotAnalysisWhyLine(input);
  if (why) lines.push(why);

  const detail = input.readiness?.detail?.trim();
  if (
    detail &&
    !isBotScanNoiseDetail(detail) &&
    detail !== why &&
    !lines.includes(detail)
  ) {
    lines.push(detail);
  }

  const headline = input.readiness?.headline?.trim();
  if (
    headline &&
    !REDUNDANT_HEADLINES.has(headline) &&
    headline !== why &&
    !lines.includes(headline) &&
    !detail?.includes(headline)
  ) {
    lines.push(headline);
  }

  const tfSummary = formatTfSummary(input.signal);
  if (tfSummary && !lines.some((l) => l.includes(tfSummary))) {
    const coin = input.scanningCoin ?? input.globalBest?.coin;
    const tfLine = coin ? `${coin} MTF: ${tfSummary}` : `MTF: ${tfSummary}`;
    if (!lines.includes(tfLine)) lines.push(tfLine);
  }

  for (const sweep of input.pumpSweepLines ?? []) {
    const trimmed = sweep.trim();
    if (trimmed && !lines.includes(trimmed)) lines.push(trimmed);
  }

  return lines;
}
