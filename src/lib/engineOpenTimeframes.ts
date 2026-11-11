import type { SignalDirection, Timeframe, TimeframeAnalysis } from './signalService';

/** Same stack the June 21 open/scan engine uses. */
export const ENGINE_OPEN_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h'];

export type EngineTfChip = {
  timeframe: Timeframe;
  direction: SignalDirection | null;
  confidence: number | null;
  revealed: boolean;
};

const TF_BREAKDOWN_RE = /(1m|5m|15m|1h)\s+(LONG|SHORT|HOLD)\s+(\d+)%/gi;

export function parseEngineMtfBreakdown(
  breakdown?: string | null
): Partial<Record<Timeframe, { direction: SignalDirection; confidence: number }>> {
  const out: Partial<Record<Timeframe, { direction: SignalDirection; confidence: number }>> = {};
  if (!breakdown) return out;
  const re = new RegExp(TF_BREAKDOWN_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(breakdown))) {
    const tf = m[1] as Timeframe;
    out[tf] = {
      direction: m[2] as SignalDirection,
      confidence: Number(m[3]) || 0,
    };
  }
  return out;
}

export function engineTfChips(
  revealedCount: number,
  rows: Partial<Record<Timeframe, { direction: SignalDirection; confidence: number } | TimeframeAnalysis | null>>
): EngineTfChip[] {
  return ENGINE_OPEN_TIMEFRAMES.map((timeframe, i) => {
    const row = rows[timeframe];
    const revealed = i < revealedCount && Boolean(row);
    return {
      timeframe,
      direction: revealed && row ? row.direction : null,
      confidence: revealed && row ? row.confidence : null,
      revealed,
    };
  });
}
