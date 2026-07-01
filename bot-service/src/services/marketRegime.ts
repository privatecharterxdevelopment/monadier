import { isStrongMtfPick, isWeekendThinLiquidityWindow, MAJOR_COINS } from './analysisFirstOpen';
import type { GlobalSignalCandidate, GlobalScanResult } from './globalMarketScan';
import type { PipelineFunnelRecorder } from './pipelineFunnelLog';
import { FUNNEL } from './pipelineFunnelReasons';
import {
  getMegaPairVolumeSnapshot,
  isMacroRiskOffEnvironment,
  validateMegaPairVolumeForDirection,
} from './megaPairVolumeMonitor';
import { computeAltUniverseBlock, type MacroRegime } from './universeFilterSymmetry';

export type { MacroRegime };

export function rankGlobalSignal(a: GlobalSignalCandidate, b: GlobalSignalCandidate): number {
  const tfsA = a.directionalTfCount ?? 0;
  const tfsB = b.directionalTfCount ?? 0;
  const majorA = MAJOR_COINS.has(a.coin.toUpperCase()) ? 1 : 0;
  const majorB = MAJOR_COINS.has(b.coin.toUpperCase()) ? 1 : 0;
  return (
    b.confidence - a.confidence ||
    tfsB - tfsA ||
    majorB - majorA ||
    (b.trendAlignment ?? 0) - (a.trendAlignment ?? 0) ||
    b.dayVolumeUsd - a.dayVolumeUsd
  );
}

export function sortGlobalSignals(signals: GlobalSignalCandidate[]): GlobalSignalCandidate[] {
  return [...signals].sort(rankGlobalSignal);
}

export function resolveMacroRegime(): { regime: MacroRegime; reason: string } {
  const riskOff = isMacroRiskOffEnvironment();
  if (riskOff.active) {
    return { regime: 'risk_off', reason: riskOff.reason };
  }

  const snap = getMegaPairVolumeSnapshot();
  if (snap?.pairs.length) {
    const inflow = snap.pairs.filter((p) => p.flow === 'INFLOW').length;
    if (inflow >= 2) {
      return { regime: 'risk_on', reason: `BTC+ETH INFLOW — ${snap.summary}` };
    }
  }

  return { regime: 'neutral', reason: snap?.summary ?? 'Mega pairs — neutral' };
}

function majorScanBias(
  scan: GlobalScanResult
): { btc?: GlobalSignalCandidate; eth?: GlobalSignalCandidate } {
  const all = [...scan.standard, ...scan.aggressive];
  return {
    btc: all.find((c) => c.coin === 'BTC'),
    eth: all.find((c) => c.coin === 'ETH'),
  };
}

export type UniverseFilterDrop = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  skipReason: string;
};

function altUniverseBlockReason(
  signal: GlobalSignalCandidate,
  regime: MacroRegime,
  majors: ReturnType<typeof majorScanBias>,
  megaLongBlock: boolean,
  megaShortBlock: boolean
): string | null {
  return computeAltUniverseBlock({
    coin: signal.coin,
    direction: signal.direction,
    regime,
    btcDirection: majors.btc?.direction,
    ethDirection: majors.eth?.direction,
    megaLongBlock,
    megaShortBlock,
  });
}

/** Signals the bot is allowed to open — symmetric default-allow with OR blockers per direction. */
export function applyOpenUniverseFilters(
  signals: GlobalSignalCandidate[],
  scan?: GlobalScanResult,
  funnel?: PipelineFunnelRecorder
): {
  signals: GlobalSignalCandidate[];
  dropped: number;
  reasons: string[];
  droppedDetails: UniverseFilterDrop[];
} {
  const reasons: string[] = [];
  const droppedDetails: UniverseFilterDrop[] = [];
  let filtered = sortGlobalSignals(signals);
  let dropped = 0;

  const { regime, reason: regimeReason } = resolveMacroRegime();
  funnel?.setMacroRegime(regime);

  if (isWeekendThinLiquidityWindow()) {
    const before = filtered.length;
    const kept: GlobalSignalCandidate[] = [];
    for (const s of filtered) {
      const coin = s.coin.toUpperCase();
      if (MAJOR_COINS.has(coin)) {
        kept.push(s);
      } else {
        droppedDetails.push({
          coin,
          direction: s.direction,
          skipReason: FUNNEL.universe.weekendAlt,
        });
        funnel?.log({
          coin,
          stage: 'universe',
          direction: s.direction,
          passed: false,
          skip_reason: FUNNEL.universe.weekendAlt,
        });
      }
    }
    filtered = kept;
    const n = before - filtered.length;
    if (n > 0) {
      dropped += n;
      reasons.push(`Weekend — no alt perps (${n} setup(s) skipped)`);
    }
  }

  const majors = scan ? majorScanBias(scan) : {};
  const btcLong = majors.btc?.direction === 'LONG';
  const ethLong = majors.eth?.direction === 'LONG';
  const btcShort = majors.btc?.direction === 'SHORT';
  const ethShort = majors.eth?.direction === 'SHORT';
  const megaLongBlock = !validateMegaPairVolumeForDirection('LONG').ok;
  const megaShortBlock = !validateMegaPairVolumeForDirection('SHORT').ok;

  const beforeMacro = filtered.length;
  const macroKept: GlobalSignalCandidate[] = [];
  for (const s of filtered) {
    const skipReason = altUniverseBlockReason(s, regime, majors, megaLongBlock, megaShortBlock);
    if (skipReason) {
      droppedDetails.push({ coin: s.coin, direction: s.direction, skipReason });
      funnel?.log({
        coin: s.coin,
        stage: 'universe',
        direction: s.direction,
        passed: false,
        skip_reason: skipReason,
      });
      continue;
    }
    macroKept.push(s);
    funnel?.log({
      coin: s.coin,
      stage: 'universe',
      direction: s.direction,
      passed: true,
      skip_reason: null,
    });
  }
  filtered = macroKept;

  const macroDropped = beforeMacro - filtered.length;
  if (macroDropped > 0) {
    dropped += macroDropped;
    const dirHint =
      btcShort || ethShort
        ? ` · BTC ${majors.btc?.direction ?? '—'} · ETH ${majors.eth?.direction ?? '—'}`
        : btcLong || ethLong
          ? ` · BTC ${majors.btc?.direction ?? '—'} · ETH ${majors.eth?.direction ?? '—'}`
          : '';
    reasons.push(`Universe filter — ${regimeReason}${dirHint}`);
  }

  return { signals: filtered, dropped, reasons, droppedDetails };
}

/** @deprecated use applyOpenUniverseFilters */
export function filterSignalsForMacroRegime(
  signals: GlobalSignalCandidate[],
  scan?: GlobalScanResult
): { signals: GlobalSignalCandidate[]; dropped: number; reason: string } {
  const result = applyOpenUniverseFilters(signals, scan);
  return {
    signals: result.signals,
    dropped: result.dropped,
    reason: result.reasons.join(' · ') || resolveMacroRegime().reason,
  };
}

export function macroAlignedPickBonus(
  signal: GlobalSignalCandidate,
  regime: MacroRegime
): number {
  const coin = signal.coin.toUpperCase();
  let bonus = 0;
  if (MAJOR_COINS.has(coin)) bonus += 50;
  if (regime === 'risk_off' && signal.direction === 'SHORT') bonus += 55;
  if (regime === 'risk_off' && signal.direction === 'LONG' && !MAJOR_COINS.has(coin)) bonus -= 120;
  if (regime === 'risk_on' && signal.direction === 'LONG' && MAJOR_COINS.has(coin)) bonus += 25;
  if (regime === 'risk_on' && signal.direction === 'SHORT' && !MAJOR_COINS.has(coin)) bonus -= 55;
  return bonus;
}

export function describeOpenUniverseForClient(scan?: GlobalScanResult): {
  regime: MacroRegime;
  weekendMajorsOnly: boolean;
  summary: string;
} {
  const { regime, reason } = resolveMacroRegime();
  const weekendMajorsOnly = isWeekendThinLiquidityWindow();
  const parts: string[] = [];
  if (weekendMajorsOnly) parts.push('Weekend — BTC/ETH only (no alt perps)');
  parts.push(reason);
  if (scan) {
    const { btc, eth } = majorScanBias(scan);
    if (btc || eth) {
      parts.push(`Scan BTC ${btc?.direction ?? '—'} · ETH ${eth?.direction ?? '—'}`);
    }
  }
  return { regime, weekendMajorsOnly, summary: parts.join(' · ') };
}

/** Human blocker when no tradeable signal — never blame weekend on weekdays. */
export function describeNoTradeableSetupBlocker(
  rawCount: number,
  filterReasons: string[]
): string {
  if (rawCount === 0) {
    return 'No aligned setup in global scan (174 perps) — waiting for BTC/ETH momentum or MTF signal';
  }
  if (filterReasons.length > 0) return filterReasons.join(' · ');
  return `Scan found ${rawCount} setup(s) but none passed macro filters`;
}

export { isStrongMtfPick };
