/**
 * Impulse → take → fade.
 *
 * Fat green 15m (the candle the user wants taken) while LONG and green:
 *   close at the next bar (take the body), then prefer SHORT once BTC is not exploding.
 * Anti-flip must not eat that second leg.
 *
 * Never closes red books. Open losers stay until the user says otherwise.
 */
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { btcIsExploding } from './macroBetaGate';

const FADE_TTL_MS = 12 * 60_000;
const FAT_BODY_PCT = 0.45;
const FAT_RANGE_PCT = 0.8;
const FAT_VOL_MULT = 1.15;
const LIVE_STILL_EXPANDING_MS = 180_000;

export type ImpulseTakeVerdict = {
  take: boolean;
  impulseComplete: boolean;
  fadeTo: 'LONG' | 'SHORT' | null;
  reason: string;
};

type PendingFade = { direction: 'LONG' | 'SHORT'; until: number };

const pendingFade = new Map<string, PendingFade>();

function fadeKey(wallet: string, coin: string): string {
  return `${wallet.toLowerCase()}:${coin.toUpperCase()}`;
}

export function rememberImpulseFade(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT',
  ttlMs = FADE_TTL_MS
): void {
  pendingFade.set(fadeKey(wallet, coin), {
    direction,
    until: Date.now() + ttlMs,
  });
  logger.info('HL impulse fade armed', {
    wallet: wallet.slice(0, 10),
    coin,
    fadeTo: direction,
    ttlSec: Math.round(ttlMs / 1000),
  });
}

/** True when this open is the fade leg after an impulse take — skip anti-flip. */
export function pendingImpulseFadeAllows(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT'
): boolean {
  const key = fadeKey(wallet, coin);
  const pending = pendingFade.get(key);
  if (!pending) return false;
  if (Date.now() > pending.until) {
    pendingFade.delete(key);
    return false;
  }
  if (pending.direction !== direction) return false;
  if (direction === 'SHORT' && btcIsExploding().yes) return false;
  return true;
}

function meanVol(bars: Candle[]): number {
  if (bars.length === 0) return 0;
  return bars.reduce((s, c) => s + (Number(c.volume) || 0), 0) / bars.length;
}

function isFatGreenImpulse(bar: Candle, prior: Candle[]): boolean {
  const open = Number(bar.open);
  const close = Number(bar.close);
  const high = Number(bar.high);
  const low = Number(bar.low);
  if (!open || open <= 0 || close <= open) return false;
  const bodyPct = ((close - open) / open) * 100;
  const rangePct = ((high - low) / open) * 100;
  if (bodyPct < FAT_BODY_PCT || rangePct < FAT_RANGE_PCT) return false;
  const avg = meanVol(prior);
  const vr = avg > 0 ? (Number(bar.volume) || 0) / avg : 1;
  return vr >= FAT_VOL_MULT;
}

function liveStillExpanding(live: Candle, prior: Candle[], nowMs: number): boolean {
  const age = nowMs - Number(live.time);
  if (age < LIVE_STILL_EXPANDING_MS) return false;
  return isFatGreenImpulse(live, prior);
}

export async function evaluateImpulseTake(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  pnlUsd: number;
}): Promise<ImpulseTakeVerdict> {
  if (!(opts.pnlUsd > 0) || opts.direction !== 'LONG') {
    return { take: false, impulseComplete: false, fadeTo: null, reason: 'impulse take — not a green LONG' };
  }

  try {
    const symbol = hlCoinToBinanceSymbol(opts.coin);
    const candles = await signalEngine.fetchCandles(symbol, '15m', 18);
    if (candles.length < 8) {
      return { take: false, impulseComplete: false, fadeTo: null, reason: 'impulse take — no 15m history' };
    }
    const live = candles[candles.length - 1];
    const closed = candles[candles.length - 2];
    const prior = candles.slice(Math.max(0, candles.length - 14), candles.length - 2);
    if (!isFatGreenImpulse(closed, prior)) {
      return { take: false, impulseComplete: false, fadeTo: null, reason: 'impulse take — last 15m not a fat green' };
    }
    if (liveStillExpanding(live, candles.slice(Math.max(0, candles.length - 14), candles.length - 1), Date.now())) {
      return {
        take: false,
        impulseComplete: false,
        fadeTo: null,
        reason: 'impulse take — live 15m still expanding, hold the candle',
      };
    }
    const bodyPct = ((closed.close - closed.open) / closed.open) * 100;
    return {
      take: true,
      impulseComplete: true,
      fadeTo: 'SHORT',
      reason: `IMPULSE TAKE — ${opts.coin} fat 15m +${bodyPct.toFixed(2)}% done, close LONG then fade SHORT`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug('impulse take skipped', { coin: opts.coin, error: msg.slice(0, 80) });
    return { take: false, impulseComplete: false, fadeTo: null, reason: 'impulse take — candle fetch failed' };
  }
}
