import type { GlobalSignalCandidate } from './globalMarketScan';
import type { EntryLocationResult } from './entryLocationGate';
import type { MacroBetaResult } from './macroBetaGate';

const SECTION = ' ‖ ';

export type OpenReasonParts = {
  mode: 'Std' | 'Agg';
  pick: GlobalSignalCandidate;
  notionalUsd?: number;
  leverage?: number;
  locationGate: EntryLocationResult;
  macroGate: MacroBetaResult;
  liquidityReason?: string;
};

/** Structured open log for pros — stored in hl_bot_chart_markers.close_reason on open events. */
export function buildHlOpenReasonDoc(parts: OpenReasonParts): string {
  const { pick, locationGate, macroGate, mode } = parts;
  const lines: string[] = [];

  lines.push(
    `${mode} ${pick.direction} ${pick.coin} ${pick.confidence}%` +
      (parts.leverage ? ` · ${parts.leverage}×` : '') +
      (parts.notionalUsd ? ` · $${parts.notionalUsd.toFixed(0)} notional` : '')
  );

  lines.push(macroGate.reason);

  if (pick.mtfBreakdown) {
    lines.push(`MTF: ${pick.mtfBreakdown}`);
  } else if (pick.reason) {
    lines.push(`Signal: ${pick.reason}`);
  }

  if (pick.trendAlignment != null) {
    lines.push(
      `Alignment: ${pick.trendAlignment}% · ${pick.directionalTfCount ?? '?'} TFs · 1h ${pick.h1Trend ?? 'n/a'}`
    );
  }

  if (parts.liquidityReason || pick.liquidityReason) {
    lines.push(`Liquidity: ${parts.liquidityReason ?? pick.liquidityReason}`);
  }

  lines.push(`Location: ${locationGate.reason}`);

  const sr = locationGate.analysis;
  if (sr.support > 0 && sr.resistance > 0) {
    lines.push(
      `S/R: support ${sr.support.toFixed(4)} · resistance ${sr.resistance.toFixed(4)} · ` +
        `range ${(sr.pricePosition * 100).toFixed(0)}% · rej R${sr.resistanceRejections}/S${sr.supportRejections}`
    );
  }

  return lines.join(SECTION);
}

/** Tooltip-friendly multiline view (frontend). */
export function formatOpenReasonForDisplay(raw: string): string {
  return raw.split(' ‖ ').map((s) => s.trim()).filter(Boolean).join('\n');
}
