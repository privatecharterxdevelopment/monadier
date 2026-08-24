/**
 * Block LONG at pump apex / mid-fade; prefer entries near estimated turnaround (avg low zone).
 */
import { config } from '../config';
import { MAJOR_COINS } from './coinTier';
import { btcLeadIsPumping, btcIsExploding } from './macroBetaGate';
import {
  fetchPumpSweepAnalysis,
  fetchMegaPairPumpSweep,
  type PumpSweepAnalysis,
} from './pumpSweepAnalytics';

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
      // Never LONG the pump high — BTC exploding does not buy the tip (LIT).
      return {
        ok: false,
        reason:
          `LONG blocked — ${coin} at pump apex $${a.pumpApex.toFixed(2)} — top of the range is SHORT`,
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

  if (a.phase === 'near_turnaround') {
    return {
      ok: false,
      reason:
        `SHORT blocked — ${coin} at turnaround zone ($${a.sweepLow.toFixed(2)}–$${a.turnaroundEstimate.toFixed(2)}) — wait for bounce-fade` +
        ` · apex $${a.pumpApex.toFixed(2)} (${a.apexAgeBars}h ago)`,
    };
  }
  if (a.phase === 'at_sweep_low') {
    return {
      ok: false,
      reason:
        `SHORT blocked — ${coin} at sweep low $${a.sweepLow.toFixed(2)} (dump floor) — wait for bounce-fade or breakdown` +
        ` · apex $${a.pumpApex.toFixed(2)} (${a.apexAgeBars}h ago)`,
    };
  }
  // Block early bounce scrapes AND lower-half post-dump shelves (Open S at floor).
  if (a.phase === 'post_dump_bounce' && a.positionInSweep < 0.5) {
    return {
      ok: false,
      reason:
        `SHORT blocked — ${coin} still in lower half after dump (${(a.positionInSweep * 100).toFixed(0)}% of range, ` +
        `sweep $${a.sweepLow.toFixed(2)}) — wait for real bounce before fade`,
    };
  }
  if (a.phase === 'post_dump_bounce' && a.positionInSweep >= 0.5) {
    return {
      ok: true,
      reason: `Pump sweep OK — ${coin} post-dump rally fade zone (${(a.positionInSweep * 100).toFixed(0)}% of range)`,
    };
  }
  if (a.phase === 'at_apex' || (a.phase === 'post_pump_fade' && a.positionInSweep >= cfg.shortAllowAbovePosition)) {
    const btc = btcIsExploding();
    if (btc.yes) {
      return {
        ok: false,
        reason: `SHORT blocked — ${coin} at apex while ${btc.reason}`,
      };
    }
    if (direction === 'SHORT' && a.retraceFromApexPct < 0) {
      return {
        ok: false,
        reason:
          `SHORT blocked — ${coin} at apex but still climbing (+${(-a.retraceFromApexPct).toFixed(2)}% from low) — wait for real fade`,
      };
    }
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
      if (
        opts.direction === 'LONG' &&
        !btcLeadIsPumping() &&
        macro &&
        (macro.phase === 'at_apex' || macro.phase === 'post_pump_fade')
      ) {
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
    return { ok: verdict.ok, reason: `${verdict.reason} · ${analysis.summary}`, analysis, macro };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: true, reason: `Pump sweep skipped (${msg.slice(0, 40)})`, analysis: null };
  }
}
