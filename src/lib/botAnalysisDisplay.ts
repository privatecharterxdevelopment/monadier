import type { BotReadiness } from './botReadiness';
import { isBotScanNoiseDetail } from './hlBotReasonLabels';

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
};

/** Primary analyzer subline — same copy as the chart analyzer strip. */
export function resolveBotAnalysisWhyLine({
  globalBest,
  readiness,
  hasTfConflict,
  openPositionsCount,
  maxConcurrentPositions,
}: WhyLineInput): string | null {
  if (globalBest?.reason?.trim()) {
    const conf = Math.round(globalBest.confidence);
    const slot =
      openPositionsCount > 0 && openPositionsCount < maxConcurrentPositions
        ? `Slot ${openPositionsCount + 1}: `
        : '';
    const line = `${slot}${globalBest.coin} ${globalBest.direction} ${conf}% — ${globalBest.reason.trim()}`;
    return isBotScanNoiseDetail(line) ? null : line;
  }
  const detail = readiness?.detail?.trim();
  if (detail && !isBotScanNoiseDetail(detail)) return detail;
  if (hasTfConflict) {
    return 'Chart timeframes on this pair disagree — bot still scans all HL perps for an aligned setup elsewhere.';
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

  return lines;
}
