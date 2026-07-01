import type { GlobalSignalCandidate } from './globalMarketScan';
import type { EntryMomentumResult } from './entryMomentumGate';
import type { PerpFundingResult } from './perpFundingGate';
import type { PriceValidityResult } from './priceValidityGate';
import { megaPairVolumeOpenReasonLine } from './megaPairVolumeMonitor';

const SECTION = ' ‖ ';

export type OpenReasonParts = {
  mode: 'Std' | 'Agg';
  pick: GlobalSignalCandidate;
  notionalUsd?: number;
  leverage?: number;
  megaGateLine?: string;
  fundingGate: PerpFundingResult;
  momentumGate: EntryMomentumResult;
  priceGate: PriceValidityResult;
  liquidityReason?: string;
};

/** Open audit — scan thesis + live delta checks only (flow, funding, momentum, price). */
export function buildHlOpenReasonDoc(parts: OpenReasonParts): string {
  const { pick, mode, momentumGate, fundingGate, priceGate } = parts;
  const lines: string[] = [];

  lines.push(
    `${mode} ${pick.direction} ${pick.coin} · confidence ${pick.confidence}%` +
      (parts.leverage ? ` · ${parts.leverage}× lev` : '') +
      (parts.notionalUsd ? ` · $${parts.notionalUsd.toFixed(0)} notional` : '')
  );

  lines.push(`── Mega flow (live) ── ${parts.megaGateLine ?? megaPairVolumeOpenReasonLine()}`);
  lines.push(`── Funding (live) ── ${fundingGate.reason}`);
  lines.push(`── Entry momentum (live) ── ${momentumGate.reason}`);
  lines.push(`── Price since scan ── ${priceGate.reason}`);

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

  if (pick.macroReason) {
    lines.push(`── Macro scan ── ${pick.macroReason}`);
  }

  if (pick.locationReason) {
    lines.push(`── Location scan ── ${pick.locationReason}`);
  }

  lines.push(`── Gates passed ── mega-flow · funding · momentum · price-drift · pick-liquidity`);

  return lines.join(SECTION);
}

export function formatOpenReasonForDisplay(raw: string): string {
  return raw
    .split(' ‖ ')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');
}
