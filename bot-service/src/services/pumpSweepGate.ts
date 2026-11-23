/**
 * Block LONG at pump apex / mid-fade; prefer entries near estimated turnaround (avg low zone).
 */
import { config } from '../config';
import { MAJOR_COINS } from './coinTier';
import {
  fetchPumpSweepAnalysis,
  fetchMegaPairPumpSweep,
  type PumpSweepAnalysis,
} from './pumpSweepAnalytics';
import { evaluateBounceLongSetup } from './bounceLongSetup';

export type PumpSweepGateResult = {
  ok: boolean;
  reason: string;
  analysis: PumpSweepAnalysis | null;
  macro?: PumpSweepAnalysis | null;
};

function shouldApply(coin: string): boolean {
  const cfg = config.hyperliquid.pumpSweep;
  if (!cfg.enabled) return false;
  if (cfg.majorsOnly) return MAJOR_COINS.has(coin.toUpperCase());
  return true;
}

function gateForDirection(
  direction: 'LONG' | 'SHORT',
  a: PumpSweepAnalysis
): { ok: boolean; reason: string } {
  const cfg = config.hyperliquid.pumpSweep;
  const coin = a.coin;

  if (direction === 'LONG') {
    if (a.phase === 'at_apex') {
      return {
        ok: false,
        reason:
          `LONG blocked — ${coin} at pump apex $${a.pumpApex.toFixed(2)} (liquidity sweep line) — ` +
          `wait for fade toward avg low ~$${a.avgSwingLow.toFixed(2)} / turnaround ~$${a.turnaroundEstimate.toFixed(2)}`,
      };
    }
    if (a.phase === 'post_pump_fade' && a.positionInSweep > cfg.longBlockAbovePosition) {
      return {
        ok: false,
        reason:
          `LONG blocked — ${coin} still fading from pump high (−${a.retraceFromApexPct.toFixed(2)}% from apex, ` +
          `${(a.positionInSweep * 100).toFixed(0)}% of range) — est. turnaround ~$${a.turnaroundEstimate.toFixed(2)}`,
      };
    }
    if (a.phase === 'near_turnaround' || a.phase === 'at_sweep_low') {
      return {
        ok: true,
        reason: `Pump sweep OK — ${coin} near turnaround zone (~$${a.turnaroundEstimate.toFixed(2)}, avg low $${a.avgSwingLow.toFixed(2)})`,
      };
    }
    return { ok: true, reason: `Pump sweep OK — ${coin} ${a.phase.replace(/_/g, ' ')}` };
  }

  if (a.phase === 'at_sweep_low' || a.phase === 'near_turnaround') {
    return {
      ok: false,
      reason:
        `SHORT blocked — ${coin} at sweep low / turnaround zone ($${a.sweepLow.toFixed(2)}–$${a.turnaroundEstimate.toFixed(2)}) — do not sell the dip`,
    };
  }
  if (a.phase === 'post_dump_bounce' && a.positionInSweep >= 0.3) {
    return {
      ok: true,
      reason: `Pump sweep OK — ${coin} post-dump rally fade zone (${(a.positionInSweep * 100).toFixed(0)}% of range)`,
    };
  }
  if (a.phase === 'at_apex' || (a.phase === 'post_pump_fade' && a.positionInSweep >= cfg.shortAllowAbovePosition)) {
    return {
      ok: true,
      reason: `Pump sweep OK — ${coin} fading from apex $${a.pumpApex.toFixed(2)} (SHORT fade zone)`,
    };
  }

  return { ok: true, reason: `Pump sweep OK — ${coin} ${a.phase.replace(/_/g, ' ')}` };
}

export async function validatePumpSweepGate(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<PumpSweepGateResult> {
  const coin = opts.coin.toUpperCase();
  if (!shouldApply(coin)) {
    return { ok: true, reason: 'Pump sweep gate — not applicable', analysis: null };
  }

  try {
    const analysis = await fetchPumpSweepAnalysis(coin);
    if (!analysis) {
      return { ok: true, reason: 'Pump sweep — insufficient 1h history', analysis: null };
    }

    let macro: PumpSweepAnalysis | null = null;
    if (!MAJOR_COINS.has(coin) && config.hyperliquid.pumpSweep.blockAltsOnMegaFade) {
      const mega = await fetchMegaPairPumpSweep();
      macro = mega.BTC ?? mega.ETH ?? null;
      if (opts.direction === 'LONG' && macro && (macro.phase === 'at_apex' || macro.phase === 'post_pump_fade')) {
        return {
          ok: false,
          reason:
            `LONG blocked — ${macro.coin} still at/post pump apex ($${macro.pumpApex.toFixed(0)}) — ` +
            `majors sweep liquidity before alt LONGs`,
          analysis,
          macro,
        };
      }
    }

    const verdict = gateForDirection(opts.direction, analysis);
    if (verdict.ok || opts.direction !== 'LONG') {
      return { ok: verdict.ok, reason: `${verdict.reason} · ${analysis.summary}`, analysis, macro };
    }

    // Precision bounce: allow LONG mid-fade / post-dump reclaim — never at apex.
    if (analysis.phase === 'at_apex') {
      return { ok: false, reason: `${verdict.reason} · ${analysis.summary}`, analysis, macro };
    }
    const bounce = await evaluateBounceLongSetup(coin);
    if (
      bounce.ok &&
      bounce.grade &&
      (analysis.phase === 'at_sweep_low' ||
        analysis.phase === 'near_turnaround' ||
        analysis.phase === 'post_dump_bounce' ||
        (analysis.phase === 'post_pump_fade' && analysis.positionInSweep <= 0.55))
    ) {
      return {
        ok: true,
        reason: `${bounce.reason} · pump-sweep allow (${analysis.phase}) · ${analysis.summary}`,
        analysis,
        macro,
      };
    }

    return { ok: false, reason: `${verdict.reason} · ${analysis.summary}`, analysis, macro };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: true, reason: `Pump sweep skipped (${msg.slice(0, 40)})`, analysis: null };
  }
}
