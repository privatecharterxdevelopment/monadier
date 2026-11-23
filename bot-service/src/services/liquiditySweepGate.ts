/**
 * Pre-trade gate: optional 24h volume floor + basic recent candle volume.
 * Liquidity sweep pattern is a bonus only — never required to open.
 */
import { config } from '../config';
import { signalEngine, type Candle } from './signalEngine';

export type LiquiditySweepType = 'HIGH_SWEEP' | 'LOW_SWEEP';

export type LiquiditySweepAnalysis = {
  sweep: LiquiditySweepType | null;
  /** Trade bias from sweep — HIGH_SWEEP → SHORT, LOW_SWEEP → LONG */
  bias: 'LONG' | 'SHORT' | null;
  volumeRatio: number;
  volumeOk: boolean;
  reason: string;
};

function avgVolume(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  return candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
}

/** Detect stop-hunt: wick through swing level, close back inside range. */
export function detectLiquiditySweep(candles: Candle[]): LiquiditySweepAnalysis {
  const lookback = config.hyperliquid.sweepLookbackBars;
  const minVolRatio = config.hyperliquid.minTradeVolumeRatio;
  const wickBufferPct = 0.0004;

  if (candles.length < lookback + 4) {
    return {
      sweep: null,
      bias: null,
      volumeRatio: 0,
      volumeOk: false,
      reason: 'insufficient candles',
    };
  }

  const swingWindow = candles.slice(-(lookback + 3), -3);
  const recent = candles.slice(-3);
  const swingHigh = Math.max(...swingWindow.map((c) => c.high));
  const swingLow = Math.min(...swingWindow.map((c) => c.low));
  const baseVol = avgVolume(candles.slice(-(lookback + 4), -1));

  let sweep: LiquiditySweepType | null = null;
  let bias: 'LONG' | 'SHORT' | null = null;
  let sweepVolRatio = 0;
  let detail = '';

  for (let i = recent.length - 1; i >= 0; i--) {
    const c = recent[i];
    const volRatio = baseVol > 0 ? c.volume / baseVol : 0;

    if (c.high > swingHigh * (1 + wickBufferPct) && c.close < swingHigh) {
      sweep = 'HIGH_SWEEP';
      bias = 'SHORT';
      sweepVolRatio = volRatio;
      detail = `high sweep +${(((c.high - swingHigh) / swingHigh) * 100).toFixed(2)}%, rejected close`;
      break;
    }
    if (c.low < swingLow * (1 - wickBufferPct) && c.close > swingLow) {
      sweep = 'LOW_SWEEP';
      bias = 'LONG';
      sweepVolRatio = volRatio;
      detail = `low sweep -${(((swingLow - c.low) / swingLow) * 100).toFixed(2)}%, rejected close`;
      break;
    }
  }

  const last = recent[recent.length - 1];
  const lastVolRatio = baseVol > 0 ? last.volume / baseVol : 0;
  const volumeRatio = sweep ? sweepVolRatio : lastVolRatio;
  const volumeOk = volumeRatio >= minVolRatio;

  return {
    sweep,
    bias,
    volumeRatio,
    volumeOk,
    reason: sweep
      ? `${detail} · vol ${volumeRatio.toFixed(2)}x`
      : `no sweep · last vol ${lastVolRatio.toFixed(2)}x`,
  };
}

export type PreTradeLiquidityResult = {
  ok: boolean;
  reason: string;
  sweep: LiquiditySweepAnalysis;
};

export async function validatePreTradeLiquidity(opts: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  dayVolumeUsd: number;
  timeframe: '1m' | '5m' | '15m';
  candleLimit?: number;
}): Promise<PreTradeLiquidityResult> {
  const minDayVol = config.hyperliquid.minDayVolumeUsd;
  if (opts.dayVolumeUsd < minDayVol) {
    return {
      ok: false,
      reason: `24h vol $${(opts.dayVolumeUsd / 1e6).toFixed(1)}M below $${(minDayVol / 1e6).toFixed(0)}M floor`,
      sweep: {
        sweep: null,
        bias: null,
        volumeRatio: 0,
        volumeOk: false,
        reason: 'skipped — low 24h volume',
      },
    };
  }

  const limit = opts.candleLimit ?? (opts.timeframe === '1m' ? 24 : 30);
  const candles = await signalEngine.fetchCandles(opts.symbol, opts.timeframe, limit);
  const sweep = detectLiquiditySweep(candles);

  if (sweep.reason === 'insufficient candles') {
    return {
      ok: true,
      reason: 'volume gate skipped — thin candle data',
      sweep,
    };
  }

  if (!sweep.volumeOk && sweep.volumeRatio === 0) {
    return {
      ok: true,
      reason: 'volume gate skipped — no baseline volume',
      sweep,
    };
  }

  if (!sweep.volumeOk) {
    return {
      ok: false,
      reason: `Volume ${sweep.volumeRatio.toFixed(2)}x < ${config.hyperliquid.minTradeVolumeRatio}x required`,
      sweep,
    };
  }

  if (sweep.bias === opts.direction) {
    return {
      ok: true,
      reason: `Sweep confirms ${opts.direction}: ${sweep.reason}`,
      sweep,
    };
  }

  return {
    ok: true,
    reason:
      sweep.bias && sweep.bias !== opts.direction
        ? `Volume OK ${sweep.volumeRatio.toFixed(2)}x (sweep ${sweep.bias} ignored)`
        : `Volume ${sweep.volumeRatio.toFixed(2)}x OK`,
    sweep,
  };
}
