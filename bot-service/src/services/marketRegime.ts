import { MAJOR_COINS } from './analysisFirstOpen';
import type { GlobalSignalCandidate, GlobalScanResult } from './globalMarketScan';
import {
  getMegaPairVolumeSnapshot,
  isMacroRiskOffEnvironment,
  validateMegaPairVolumeForDirection,
} from './megaPairVolumeMonitor';

export type MacroRegime = 'risk_off' | 'risk_on' | 'neutral';

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

/** Drop alt LONGs when BTC/ETH dump or mega-cap flow is risk-off. */
export function filterSignalsForMacroRegime(
  signals: GlobalSignalCandidate[],
  scan?: GlobalScanResult
): { signals: GlobalSignalCandidate[]; dropped: number; reason: string } {
  const { regime, reason } = resolveMacroRegime();
  const majors = scan ? majorScanBias(scan) : {};
  const btcShort = majors.btc?.direction === 'SHORT';
  const ethShort = majors.eth?.direction === 'SHORT';
  const megaLongBlock = !validateMegaPairVolumeForDirection('LONG').ok;

  const filtered = signals.filter((s) => {
    if (MAJOR_COINS.has(s.coin.toUpperCase())) return true;
    if (s.direction !== 'LONG') return true;

    if (regime === 'risk_off') return false;
    if (megaLongBlock) return false;
    if (btcShort && ethShort) return false;
    if (btcShort && (majors.eth?.direction !== 'LONG')) return false;

    return true;
  });

  const dropped = signals.length - filtered.length;
  const detail =
    dropped > 0
      ? `${reason}${btcShort || ethShort ? ` · BTC scan ${majors.btc?.direction ?? '—'} · ETH ${majors.eth?.direction ?? '—'}` : ''}`
      : reason;

  return { signals: filtered, dropped, reason: detail };
}

/** Prefer SHORT + majors when market is dumping; don't let TRX volume beat BTC/ETH thesis. */
export function macroAlignedPickBonus(
  signal: GlobalSignalCandidate,
  regime: MacroRegime
): number {
  const coin = signal.coin.toUpperCase();
  let bonus = 0;
  if (MAJOR_COINS.has(coin)) bonus += 35;
  if (regime === 'risk_off' && signal.direction === 'SHORT') bonus += 45;
  if (regime === 'risk_off' && signal.direction === 'LONG' && !MAJOR_COINS.has(coin)) bonus -= 80;
  if (regime === 'risk_on' && signal.direction === 'LONG') bonus += 20;
  return bonus;
}
