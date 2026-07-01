/**
 * Unified higher-timeframe trend alignment — merges 1h MTF override (scan 1.8)
 * and 4h/24h structural bias (scan 1.10) into a single pass/block decision.
 */
import { config } from '../config';
import { mtfOverridesTrendOnlyFilter } from './analysisFirstOpen';
import {
  assessHigherTfShortBias,
  evaluateLongWithHigherTfBias,
  evaluateShortWithHigherTfBias,
  type HigherTfShortBias,
} from './higherTfShortBias';
import { FUNNEL } from './pipelineFunnelReasons';

export type TrendAlignmentEval = {
  ok: boolean;
  skipReason?: string;
  adjustedConfidence: number;
  reason: string;
  bias: HigherTfShortBias | null;
};

/** Single scan-time trend gate — 1h filter then 4h/24h bias (thresholds unchanged). */
export async function evaluateScanTrendAlignment(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  baseConfidence: number;
  minConfidence: number;
  h1Trend?: string | null;
  directionalTfCount?: number;
}): Promise<TrendAlignmentEval> {
  const { direction, baseConfidence, minConfidence, h1Trend, directionalTfCount } = opts;

  if (
    !mtfOverridesTrendOnlyFilter(direction, h1Trend, directionalTfCount)
  ) {
    return {
      ok: false,
      skipReason: FUNNEL.scan.trend1h,
      adjustedConfidence: baseConfidence,
      reason: `1h trend blocks ${direction}`,
      bias: null,
    };
  }

  const bias = await assessHigherTfShortBias(opts.coin);
  const htf =
    direction === 'SHORT'
      ? evaluateShortWithHigherTfBias(baseConfidence, minConfidence, bias)
      : evaluateLongWithHigherTfBias(baseConfidence, minConfidence, bias);

  if (!htf.ok) {
    return {
      ok: false,
      skipReason: FUNNEL.scan.htfBias,
      adjustedConfidence: htf.adjustedConfidence,
      reason: htf.reason,
      bias,
    };
  }

  return {
    ok: true,
    adjustedConfidence: htf.adjustedConfidence,
    reason: htf.reason,
    bias,
  };
}

export { assessHigherTfShortBias, evaluateLongWithHigherTfBias, evaluateShortWithHigherTfBias };
