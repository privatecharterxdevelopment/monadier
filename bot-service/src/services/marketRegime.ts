import { isStrongMtfPick, MAJOR_COINS } from './analysisFirstOpen';
import type { GlobalSignalCandidate, GlobalScanResult } from './globalMarketScan';
import type { PipelineFunnelRecorder } from './pipelineFunnelLog';
import { FUNNEL } from './pipelineFunnelReasons';
import {
  getMegaPairVolumeSnapshot,
  isMacroRiskOffEnvironment,
  validateMegaPairVolumeForDirection,
} from './megaPairVolumeMonitor';
import { computeAltUniverseBlock, type MacroRegime } from './universeFilterSymmetry';
import { liveMegaMajorDirections } from './btcMacroShortGate';

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
    const btc = snap.pairs.find((p) => p.coin === 'BTC');
    if (inflow >= 2) {
      return { regime: 'risk_on', reason: `BTC+ETH INFLOW — ${snap.summary}` };
    }
    if (
      btc?.flow === 'INFLOW' &&
      (btc.change15mPct >= 0.08 || btc.change5mPct >= 0.06)
    ) {
      return { regime: 'risk_on', reason: `BTC-led INFLOW — ${snap.summary}` };
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
  btcDirection: 'LONG' | 'SHORT' | undefined,
  ethDirection: 'LONG' | 'SHORT' | undefined,
  megaLongBlock: boolean,
  megaShortBlock: boolean
): string | null {
  return computeAltUniverseBlock({
    coin: signal.coin,
    direction: signal.direction,
    regime,
    btcDirection,
    ethDirection,
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

  const majors = scan ? majorScanBias(scan) : {};
  const liveMajors = liveMegaMajorDirections();
  const btcDirection = liveMajors.btc ?? majors.btc?.direction;
  const ethDirection = liveMajors.eth ?? majors.eth?.direction;
  const btcLong = btcDirection === 'LONG';
  const ethLong = ethDirection === 'LONG';
  const btcShort = btcDirection === 'SHORT';
  const ethShort = ethDirection === 'SHORT';
  const megaLongBlock = !validateMegaPairVolumeForDirection('LONG').ok;
  const megaShortBlock = !validateMegaPairVolumeForDirection('SHORT').ok;

  const beforeMacro = filtered.length;
  const macroKept: GlobalSignalCandidate[] = [];
  for (const s of filtered) {
    const skipReason = altUniverseBlockReason(
      s,
      regime,
      btcDirection,
      ethDirection,
      megaLongBlock,
      megaShortBlock
    );
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
        ? ` · BTC ${btcDirection ?? '—'} · ETH ${ethDirection ?? '—'}`
        : btcLong || ethLong
          ? ` · BTC ${btcDirection ?? '—'} · ETH ${ethDirection ?? '—'}`
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
  if (regime === 'risk_on' && signal.direction === 'LONG' && !MAJOR_COINS.has(coin)) bonus += 45;
  if (regime === 'risk_on' && signal.direction === 'SHORT' && !MAJOR_COINS.has(coin)) bonus -= 80;
  if (regime === 'risk_on' && signal.direction === 'SHORT' && MAJOR_COINS.has(coin)) bonus -= 120;
  return bonus;
}

export function describeOpenUniverseForClient(scan?: GlobalScanResult): {
  regime: MacroRegime;
  weekendMajorsOnly: boolean;
  summary: string;
} {
  const { regime, reason } = resolveMacroRegime();
  const parts: string[] = [reason];
  if (scan) {
    const { btc, eth } = majorScanBias(scan);
    if (btc || eth) {
      parts.push(`Scan BTC ${btc?.direction ?? '—'} · ETH ${eth?.direction ?? '—'}`);
    }
  }
  return { regime, weekendMajorsOnly: false, summary: parts.join(' · ') };
}

/** Human blocker when no tradeable signal after global scan. */
export function describeNoTradeableSetupBlocker(
  rawCount: number,
  filterReasons: string[]
): string {
  if (rawCount === 0) {
    return 'No setup passed scan gates yet (175 perps) — need aligned MTF + entry location';
  }
  if (filterReasons.length > 0) return filterReasons.join(' · ');
  return `Scan found ${rawCount} setup(s) but none passed macro filters`;
}

export { isStrongMtfPick };
