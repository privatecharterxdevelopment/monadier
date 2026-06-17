/**
 * Signal Service - Frontend API client for Multi-Timeframe Signal Engine
 *
 * This service fetches unified signals from the bot-service API,
 * ensuring frontend and bot use the SAME signal logic.
 */

/**
 * Same-origin /bot-service proxy (Vite dev + Vercel prod) → Railway bot.
 * Override with VITE_BOT_API_URL=http://localhost:3001 when running bot-service locally.
 */
export function getBotApiBase(): string {
  const fromEnv = import.meta.env.VITE_BOT_API_URL?.replace(/\/$/, '') ?? '';
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/bot-service`;
  }
  return import.meta.env.DEV
    ? 'http://localhost:3001'
    : 'https://monadier-production.up.railway.app';
}

// Types matching the SignalEngine output
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h';
export type SignalDirection = 'LONG' | 'SHORT' | 'HOLD';

export interface Pattern {
  type: string;
  direction: 'bullish' | 'bearish';
  strength: number;
  candleIndex: number;
}

export interface TimeframeAnalysis {
  timeframe: Timeframe;
  direction: SignalDirection;
  confidence: number;
  trend: 'UP' | 'DOWN' | 'SIDEWAYS';
  rsi: number;
  macdSignal: 'bullish' | 'bearish' | 'neutral';
  patterns: Pattern[];
  support: number;
  resistance: number;
  currentPrice: number;
}

export interface UnifiedSignal {
  symbol: string;
  direction: SignalDirection;
  confidence: number;
  timeframes: TimeframeAnalysis[];
  trendAlignment: number;
  patternStrength: number;
  patterns: Pattern[];
  suggestedEntry: number;
  suggestedTP: number;
  suggestedSL: number;
  reasons: string[];
  warnings: string[];
  timestamp: number;
}

interface SignalResponse {
  success: boolean;
  signal: UnifiedSignal;
  timestamp: string;
  error?: string;
}

interface TimeframeResponse {
  success: boolean;
  analysis: TimeframeAnalysis;
  timestamp: string;
  error?: string;
}

/**
 * Fetch unified MTF signal from bot-service
 * This is the SAME signal the bot uses for trading decisions
 */
export async function fetchUnifiedSignal(
  symbol: string = 'ETHUSDT',
  timeframes: Timeframe[] = ['1m', '5m', '15m', '1h']
): Promise<UnifiedSignal | null> {
  const base = getBotApiBase();
  if (!base) {
    console.warn('[signalService] Bot API base URL missing');
    return null;
  }
  try {
    const url = `${base}/api/signal?symbol=${symbol}&timeframes=${timeframes.join(',')}`;
    const response = await fetch(url, {
      mode: 'cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      console.error('Signal fetch HTTP', response.status, response.statusText);
      return null;
    }
    const data: SignalResponse = await response.json();

    if (!data.success || !data.signal) {
      console.error('Signal fetch failed:', data.error);
      return null;
    }

    return data.signal;
  } catch (err) {
    console.error('Failed to fetch unified signal:', err);
    return null;
  }
}

/**
 * Fetch single timeframe analysis
 */
export async function fetchTimeframeAnalysis(
  symbol: string = 'ETHUSDT',
  timeframe: Timeframe = '15m'
): Promise<TimeframeAnalysis | null> {
  const base = getBotApiBase();
  if (!base) return null;
  try {
    const url = `${base}/api/timeframe?symbol=${symbol}&tf=${timeframe}`;
    const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!response.ok) return null;
    const data: TimeframeResponse = await response.json();

    if (!data.success || !data.analysis) {
      console.error('Timeframe analysis failed:', data.error);
      return null;
    }

    return data.analysis;
  } catch (err) {
    console.error('Failed to fetch timeframe analysis:', err);
    return null;
  }
}

/**
 * Get signal direction color for UI display
 */
export function getSignalColor(direction: SignalDirection): string {
  switch (direction) {
    case 'LONG':
      return 'text-green-500';
    case 'SHORT':
      return 'text-red-500';
    default:
      return 'text-yellow-500';
  }
}

/**
 * Get signal direction background for UI display
 */
export function getSignalBgColor(direction: SignalDirection): string {
  switch (direction) {
    case 'LONG':
      return 'bg-green-500/20';
    case 'SHORT':
      return 'bg-red-500/20';
    default:
      return 'bg-yellow-500/20';
  }
}

/**
 * Format confidence as percentage string
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence)}%`;
}

/**
 * Get pattern display name
 */
export function formatPatternName(patternType: string): string {
  return patternType
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Check if signal is strong enough for trading
 * This matches the bot's threshold logic
 */
export function isSignalStrong(signal: UnifiedSignal, minConfidence: number = 40): boolean {
  return signal.confidence >= minConfidence &&
         signal.direction !== 'HOLD' &&
         signal.trendAlignment >= 50;
}

/**
 * Get timeframe weight description
 */
export function getTimeframeWeight(timeframe: Timeframe): { trend: string; entry: string } {
  const weights: Record<Timeframe, { trend: string; entry: string }> = {
    '1m': { trend: '5%', entry: '30%' },
    '5m': { trend: '10%', entry: '30%' },
    '15m': { trend: '20%', entry: '25%' },
    '1h': { trend: '35%', entry: '10%' },
    '4h': { trend: '30%', entry: '5%' },
  };
  return weights[timeframe];
}
