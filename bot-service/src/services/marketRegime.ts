import { isWeekendThinLiquidityWindow, MAJOR_COINS } from './analysisFirstOpen';
import type { GlobalSignalCandidate, GlobalScanResult } from './globalMarketScan';
import {
  getMegaPairVolumeSnapshot,
  isMacroRiskOffEnvironment,
  validateMegaPairVolumeForDirection,
} from './megaPairVolumeMonitor';

export type MacroRegime = 'risk_off' | 'risk_on' | 'neutral';

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

/** Signals the bot is allowed to open — same list the UI must show. */
export function applyOpenUniverseFilters(
  signals: GlobalSignalCandidate[],
  scan?: GlobalScanResult
): { signals: GlobalSignalCandidate[]; dropped: number; reasons: string[] } {
  const reasons: string[] = [];
  let filtered = sortGlobalSignals(signals);
  let dropped = 0;

  if (isWeekendThinLiquidityWindow()) {
    const before = filtered.length;
    filtered = filtered.filter((s) => {
      const coin = s.coin.toUpperCase();
      if (s.direction === 'LONG') return false;
      return MAJOR_COINS.has(coin);
    });
    const n = before - filtered.length;
    if (n > 0) {
      dropped += n;
      reasons.push(`Weekend — no LONGs · BTC/ETH SHORT only (${n} setup(s) skipped)`);
    }
  }

  const { regime, reason: regimeReason } = resolveMacroRegime();
  const majors = scan ? majorScanBias(scan) : {};
  const btcLong = majors.btc?.direction === 'LONG';
  const ethLong = majors.eth?.direction === 'LONG';
  const btcShort = majors.btc?.direction === 'SHORT';
  const ethShort = majors.eth?.direction === 'SHORT';
  const megaLongBlock = !validateMegaPairVolumeForDirection('LONG').ok;

  const beforeMacro = filtered.length;
  filtered = filtered.filter((s) => {
    const coin = s.coin.toUpperCase();
    if (MAJOR_COINS.has(coin)) return true;
    if (s.direction === 'SHORT') return true;

    if (regime === 'risk_off') return false;
    if (megaLongBlock) return false;
    if (btcShort || ethShort) return false;
    if (!(btcLong && ethLong && regime === 'risk_on')) return false;
    return true;
  });
  const macroDropped = beforeMacro - filtered.length;
  if (macroDropped > 0) {
    dropped += macroDropped;
    reasons.push(
      `No alt LONGs — ${regimeReason}${btcShort || ethShort ? ` · BTC ${majors.btc?.direction ?? '—'} · ETH ${majors.eth?.direction ?? '—'}` : ''}`
    );
  }

  return { signals: filtered, dropped, reasons };
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
  return bonus;
}

export function describeOpenUniverseForClient(scan?: GlobalScanResult): {
  regime: MacroRegime;
  weekendMajorsOnly: boolean;
  summary: string;
} {
  const { regime, reason } = resolveMacroRegime();
  const weekendMajorsOnly = isWeekendThinLiquidityWindow();
  const parts = [reason];
  if (weekendMajorsOnly) parts.unshift('Weekend — no LONGs · BTC/ETH SHORT only');
  if (scan) {
    const { btc, eth } = majorScanBias(scan);
    if (btc || eth) {
      parts.push(`Scan BTC ${btc?.direction ?? '—'} · ETH ${eth?.direction ?? '—'}`);
    }
  }
  return { regime, weekendMajorsOnly, summary: parts.join(' · ') };
}
