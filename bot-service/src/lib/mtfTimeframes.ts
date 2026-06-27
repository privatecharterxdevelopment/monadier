import type { Timeframe } from '../services/signalEngine';

/** Standard bot — trend + setup without 1m noise. */
export const STANDARD_MTF_TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h'];

export const STANDARD_MTF_COUNT = STANDARD_MTF_TIMEFRAMES.length;

/** Aggressive scalp — 1m timing with 5m confirm (see aggressiveScalpAnalysis). */
export const AGGRESSIVE_SCALP_TIMEFRAMES: Timeframe[] = ['1m', '5m'];
