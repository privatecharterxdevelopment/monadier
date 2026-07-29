/**
 * LONG-only entry rules (user requirement):
 * 1) Decision on 1h basis — 1h trend must be UP
 * 2) Timing — only in the last N minutes of the current UTC 1h candle
 *
 * SHORT is never gated here.
 */
import { config } from '../config';
import { signalEngine } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type Long1hEntryResult = {
  ok: boolean;
  reason: string;
  minutesIntoHour?: number;
  minutesLeftInHour?: number;
  trend1h?: string;
};

function trendIsUp(raw: string | undefined): boolean {
  const t = String(raw ?? '').toUpperCase();
  if (!t) return false;
  return t === 'UP' || t.includes('UP') || t.includes('LONG') || t === 'STRONG_UPTREND';
}

/** UTC ms into the current clock hour (0 … 3_599_999). */
export function utcMsIntoHour(nowMs = Date.now()): number {
  return ((nowMs % 3_600_000) + 3_600_000) % 3_600_000;
}

export function validateLong1hCandleWindow(
  direction: 'LONG' | 'SHORT',
  nowMs = Date.now()
): Long1hEntryResult {
  if (direction !== 'LONG') {
    return { ok: true, reason: 'LONG 1h window — N/A for SHORT' };
  }

  const windowMin = Math.max(
    1,
    Math.floor(config.hyperliquid.long1hEntry.lastMinutesOfHour || 5)
  );
  const into = utcMsIntoHour(nowMs);
  const left = 3_600_000 - into;
  const minutesIntoHour = into / 60_000;
  const minutesLeftInHour = left / 60_000;
  const windowMs = windowMin * 60_000;

  if (left > windowMs) {
    return {
      ok: false,
      reason: `LONG blocked — only last ${windowMin}m of the 1h candle (now ${minutesIntoHour.toFixed(1)}m into hour, ${minutesLeftInHour.toFixed(1)}m left)`,
      minutesIntoHour,
      minutesLeftInHour,
    };
  }

  return {
    ok: true,
    reason: `LONG 1h window OK — last ${windowMin}m (${minutesLeftInHour.toFixed(1)}m left in hour)`,
    minutesIntoHour,
    minutesLeftInHour,
  };
}

export async function validateLong1hBasis(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<Long1hEntryResult> {
  if (opts.direction !== 'LONG') {
    return { ok: true, reason: 'LONG 1h basis — N/A for SHORT' };
  }

  const symbol = hlCoinToBinanceSymbol(opts.coin.toUpperCase());
  try {
    const tf1h = await signalEngine.analyzeTimeframe(symbol, '1h');
    const trend1h = tf1h?.trend ?? 'SIDEWAYS';
    if (!trendIsUp(trend1h)) {
      return {
        ok: false,
        reason: `LONG blocked — 1h trend ${trend1h} (need UP)`,
        trend1h,
      };
    }
    return {
      ok: true,
      reason: `LONG 1h basis OK — trend ${trend1h}`,
      trend1h,
    };
  } catch {
    return {
      ok: false,
      reason: 'LONG blocked — 1h basis check failed',
    };
  }
}

/** Window + 1h UP — call with final trade direction (after zone/LLM flip). */
export async function validateLong1hEntry(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  nowMs?: number;
}): Promise<Long1hEntryResult> {
  const window = validateLong1hCandleWindow(opts.direction, opts.nowMs);
  if (!window.ok) return window;
  const basis = await validateLong1hBasis({
    coin: opts.coin,
    direction: opts.direction,
  });
  if (!basis.ok) return basis;
  return {
    ok: true,
    reason: `${basis.reason} · ${window.reason}`,
    trend1h: basis.trend1h,
    minutesIntoHour: window.minutesIntoHour,
    minutesLeftInHour: window.minutesLeftInHour,
  };
}
