import type { GlobalSignalCandidate } from './globalMarketScan';
import type { EntryLocationResult } from './entryLocationGate';
import type { MacroBetaResult } from './macroBetaGate';
import type { EntryMomentumResult } from './entryMomentumGate';
import type { PumpShortResult } from './pumpShortGate';
import { megaPairVolumeOpenReasonLine } from './megaPairVolumeMonitor';

const SECTION = ' ‖ ';

export type OpenReasonParts = {
  mode: 'Std' | 'Agg';
  pick: GlobalSignalCandidate;
  notionalUsd?: number;
  leverage?: number;
  locationGate: EntryLocationResult;
  macroGate: MacroBetaResult;
  momentumGate?: EntryMomentumResult;
  pumpShortGate?: PumpShortResult;
  megaPairLine?: string;
  liquidityReason?: string;
};

/** Full open audit — every gate + indicator that led to the trade. */
export function buildHlOpenReasonDoc(parts: OpenReasonParts): string {
  const { pick, locationGate, macroGate, mode, momentumGate } = parts;
  const lines: string[] = [];

  lines.push(
    `${mode} ${pick.direction} ${pick.coin} · confidence ${pick.confidence}%` +
      (parts.leverage ? ` · ${parts.leverage}× lev` : '') +
      (parts.notionalUsd ? ` · $${parts.notionalUsd.toFixed(0)} notional` : '')
  );

  lines.push(`── Macro beta ── ${macroGate.reason}`);
  lines.push(`── Mega caps ── ${parts.megaPairLine ?? megaPairVolumeOpenReasonLine()}`);

  if (momentumGate) {
    lines.push(`── Entry momentum ── ${momentumGate.reason}`);
  } else if (pick.momentumReason) {
    lines.push(`── Entry momentum ── ${pick.momentumReason}`);
  }

  if (parts.pumpShortGate) {
    lines.push(`── Pump / fade ── ${parts.pumpShortGate.reason}`);
  }

  if (pick.mtfBreakdown) {
    lines.push(`── MTF breakdown ── ${pick.mtfBreakdown}`);
  }

  if (pick.signalReasons && pick.signalReasons.length > 0) {
    lines.push(`── Signal engine ── ${pick.signalReasons.join(' | ')}`);
  } else if (pick.reason) {
    lines.push(`── Signal ── ${pick.reason}`);
  }

  if (pick.indicators && pick.indicators.length > 0) {
    lines.push(`── Patterns / indicators ── ${pick.indicators.join(' · ')}`);
  }

  if (pick.trendAlignment != null) {
    lines.push(
      `── Trend align ── ${pick.trendAlignment}% · ${pick.directionalTfCount ?? '?'} TFs agree · 1h ${pick.h1Trend ?? 'n/a'}`
    );
  }

  const liq = parts.liquidityReason ?? pick.liquidityReason;
  if (liq) lines.push(`── Liquidity / volume ── ${liq}`);

  if (pick.macroReason && !pick.macroReason.includes(macroGate.reason.slice(0, 20))) {
    lines.push(`── Macro scan ── ${pick.macroReason}`);
  }

  lines.push(`── Location / S-R ── ${locationGate.reason}`);

  const sr = locationGate.analysis;
  if (sr.support > 0 && sr.resistance > 0) {
    lines.push(
      `── Range ── support ${sr.support.toFixed(4)} · resistance ${sr.resistance.toFixed(4)} · ` +
        `price ${(sr.pricePosition * 100).toFixed(0)}% of range · ` +
        `rejections R${sr.resistanceRejections} / S${sr.supportRejections}`
    );
  }

  if (pick.locationReason && pick.locationReason !== locationGate.reason) {
    lines.push(`── Location scan ── ${pick.locationReason}`);
  }

  lines.push(`── Gates passed ── macro · pump-fade · mega caps · momentum · liquidity · location · MTF`);

  return lines.join(SECTION);
}

export function formatOpenReasonForDisplay(raw: string): string {
  return raw
    .split(' ‖ ')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');
}
