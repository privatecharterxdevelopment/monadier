/**
 * BTC lead + major pump tape.
 *
 * SOL / ETH / all listed majors: no SHORT while a pump is happening
 * (live BTC 1h or the coin's own live 15m/1h). Alts can still short dumps.
 * Thesis on already-open books stays per-coin (hands-off).
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type MacroMomentum = {
  change15mPct: number;
  change1hPct: number;
  live1hBarPct: number;
  trend15m: 'UP' | 'DOWN' | 'FLAT';
  trend1h: 'UP' | 'DOWN' | 'FLAT';
  consecutiveGreen15m: number;
  consecutiveRed15m: number;
};

export type MacroBetaSnapshot = {
  coin: string;
  anchor: 'BTC' | 'ETH' | 'SELF';
  btc: MacroMomentum;
  eth: MacroMomentum;
  coinMom: MacroMomentum;
  checkedAt: string;
};

export type MacroBetaResult = {
  ok: boolean;
  reason: string;
  snapshot: MacroBetaSnapshot;
  blockers: string[];
};

const ETH_BETA_COINS = new Set([
  'WLD',
  'OP',
  'ARB',
  'STRK',
  'BLAST',
  'MATIC',
  'POL',
  'LDO',
  'IMX',
  'METIS',
  'MANTA',
  'ZK',
  'ENS',
  'FXS',
  'SSV',
  'RPL',
  'ETHFI',
  'EIGEN',
  'ZRO',
  'ALT',
  'APE',
]);

const BTC_LEAD_CACHE_MS = Number(process.env.HL_BTC_LEAD_CACHE_MS || 15_000);

let btcLeadMom: MacroMomentum | null = null;
let btcLeadAt = 0;
let btcLeadInFlight: Promise<MacroMomentum> | null = null;

export function emptyMacroMomentum(): MacroMomentum {
  return {
    change15mPct: 0,
    change1hPct: 0,
    live1hBarPct: 0,
    trend15m: 'FLAT',
    trend1h: 'FLAT',
    consecutiveGreen15m: 0,
    consecutiveRed15m: 0,
  };
}

function classifyAnchor(coin: string): 'BTC' | 'ETH' | 'SELF' {
  const c = coin.toUpperCase();
  if (c === 'BTC') return 'SELF';
  if (c === 'ETH') return 'SELF';
  if (ETH_BETA_COINS.has(c)) return 'ETH';
  return 'BTC';
}

function trendFromPct(pct: number, threshold: number): 'UP' | 'DOWN' | 'FLAT' {
  if (pct >= threshold) return 'UP';
  if (pct <= -threshold) return 'DOWN';
  return 'FLAT';
}

function liveBarPct(candles: Candle[]): number {
  if (candles.length < 1) return 0;
  const last = candles[candles.length - 1];
  if (!last?.open || last.open <= 0) return 0;
  return ((last.close - last.open) / last.open) * 100;
}

function countConsecutive(candles: Candle[], bullish: boolean): number {
  let n = 0;
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const c = candles[i];
    const match = bullish ? c.close > c.open : c.close < c.open;
    if (!match) break;
    n += 1;
  }
  return n;
}

function pctChange(candles: Candle[], bars: number): number {
  if (candles.length < bars + 1) return 0;
  const end = candles[candles.length - 1];
  const start = candles[candles.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

function buildMomentum(c15m: Candle[], c1h: Candle[], flatThreshold: number): MacroMomentum {
  const change15mPct = pctChange(c15m, 1);
  const change1hPct = pctChange(c15m, 4);
  const live1hBarPct = liveBarPct(c1h);
  return {
    change15mPct,
    change1hPct,
    live1hBarPct,
    trend15m: trendFromPct(change15mPct, flatThreshold),
    trend1h: trendFromPct(Math.max(change1hPct, live1hBarPct), flatThreshold * 1.5),
    consecutiveGreen15m: countConsecutive(c15m, true),
    consecutiveRed15m: countConsecutive(c15m, false),
  };
}

function fmtMom(label: string, m: MacroMomentum): string {
  return (
    `${label} 15m ${m.change15mPct >= 0 ? '+' : ''}${m.change15mPct.toFixed(2)}% (${m.trend15m})` +
    ` · 1h ${m.change1hPct >= 0 ? '+' : ''}${m.change1hPct.toFixed(2)}% (${m.trend1h})` +
    ` · live 1h ${m.live1hBarPct >= 0 ? '+' : ''}${m.live1hBarPct.toFixed(2)}%` +
    (m.consecutiveGreen15m >= 2 ? ` · ${m.consecutiveGreen15m}× green 15m` : '') +
    (m.consecutiveRed15m >= 2 ? ` · ${m.consecutiveRed15m}× red 15m` : '')
  );
}

async function fetchMomentum(symbol: string): Promise<MacroMomentum> {
  const flat = config.hyperliquid.macroBeta.flatTrendPct;
  const [c15m, c1h] = await Promise.all([
    signalEngine.fetchCandles(symbol, '15m', 30),
    signalEngine.fetchCandles(symbol, '1h', 4),
  ]);
  if (c15m.length < 6) return emptyMacroMomentum();
  return buildMomentum(c15m, c1h, flat);
}

function isPumping(m: MacroMomentum, label: string, require15mConfirmForClosed1h = false): string[] {
  const cfg = config.hyperliquid.macroBeta;
  const pump15 = cfg.pumpBlock15mPct;
  const pump1h = cfg.pumpBlock1hPct;
  const minGreen = cfg.minConsecutiveGreen15m;
  const hits: string[] = [];
  if (m.change15mPct >= pump15) hits.push(`${label} 15m +${m.change15mPct.toFixed(2)}%`);
  if (
    m.consecutiveGreen15m >= minGreen &&
    m.change15mPct >= Math.max(pump15 * 0.45, cfg.flatTrendPct)
  ) {
    hits.push(`${label} ${m.consecutiveGreen15m}× green 15m candles`);
  }
  if (m.live1hBarPct >= pump1h) {
    hits.push(`${label} live 1h bar +${m.live1hBarPct.toFixed(2)}%`);
  }
  if (m.change1hPct >= pump1h) {
    const confirmed =
      !require15mConfirmForClosed1h ||
      m.trend15m === 'UP' ||
      m.change15mPct >= pump15 * 0.5 ||
      m.live1hBarPct >= pump1h * 0.5;
    if (confirmed) {
      hits.push(`${label} 1h +${m.change1hPct.toFixed(2)}%`);
    }
  }
  return hits;
}

function isDumping(m: MacroMomentum, label: string, require15mConfirmFor1h = false): string[] {
  const cfg = config.hyperliquid.macroBeta;
  const dump15 = cfg.dumpBlock15mPct;
  const dump1h = cfg.dumpBlock1hPct;
  const minRed = cfg.minConsecutiveRed15m;
  const hits: string[] = [];
  if (m.change15mPct <= -dump15) hits.push(`${label} 15m ${m.change15mPct.toFixed(2)}%`);
  if (
    m.consecutiveRed15m >= minRed &&
    m.change15mPct <= -Math.max(dump15 * 0.45, cfg.flatTrendPct)
  ) {
    hits.push(`${label} ${m.consecutiveRed15m}× red 15m candles`);
  }
  if (m.live1hBarPct <= -dump1h) {
    hits.push(`${label} live 1h bar ${m.live1hBarPct.toFixed(2)}%`);
  }
  if (m.change1hPct <= -dump1h) {
    const confirmed =
      !require15mConfirmFor1h ||
      m.trend15m === 'DOWN' ||
      m.change15mPct <= -dump15 * 0.5 ||
      m.live1hBarPct <= -dump1h * 0.5;
    if (confirmed) {
      hits.push(`${label} 1h ${m.change1hPct.toFixed(2)}%`);
    }
  }
  return hits;
}

export async function refreshBtcLeadMomentum(): Promise<MacroMomentum> {
  const now = Date.now();
  if (btcLeadMom && now - btcLeadAt < BTC_LEAD_CACHE_MS) return btcLeadMom;
  if (btcLeadInFlight) return btcLeadInFlight;
  btcLeadInFlight = (async () => {
    try {
      const mom = await fetchMomentum('BTCUSDT');
      btcLeadMom = mom;
      btcLeadAt = Date.now();
      return mom;
    } finally {
      btcLeadInFlight = null;
    }
  })();
  return btcLeadInFlight;
}

function isLivePumpHappening(m: MacroMomentum): boolean {
  const cfg = config.hyperliquid.macroBeta;
  return (
    m.live1hBarPct >= cfg.majorLivePump1hPct ||
    m.change15mPct >= cfg.majorLivePump15mPct ||
    (m.consecutiveGreen15m >= 2 && m.change15mPct >= Math.max(0.08, cfg.flatTrendPct * 0.8))
  );
}

export function isPumpFollowMajor(coin: string): boolean {
  return config.hyperliquid.noShortPumpMajors.has(coin.toUpperCase());
}

/** BTC 1h/15m pump is live — majors follow, do not fade them. */
export function btcLeadIsPumping(): boolean {
  if (!btcLeadMom) return false;
  return isLivePumpHappening(btcLeadMom) || isPumping(btcLeadMom, 'BTC', false).length > 0;
}

/**
 * Pump is live on BTC or this major → OPEN LONG (continuation), do not fade.
 * Short-block alone left the bot flat; this is the long-focus half.
 */
export async function majorPumpPrefersLong(coin: string): Promise<boolean> {
  const c = coin.toUpperCase();
  if (!isPumpFollowMajor(c)) return false;
  const btc = await refreshBtcLeadMomentum();
  if (btcLeadIsPumping()) return true;
  try {
    const mom =
      c === 'BTC'
        ? btc
        : c === 'ETH'
          ? await fetchMomentum('ETHUSDT')
          : await fetchMomentum(hlCoinToBinanceSymbol(c));
    return isLivePumpHappening(mom) || isPumping(mom, c, true).length > 0;
  } catch {
    return false;
  }
}

export async function evaluateMacroBetaAlignment(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  /** `open` = new entries (BTC lead applies). `thesis` = open books, per-coin only. */
  scope?: 'open' | 'thesis';
}): Promise<MacroBetaResult> {
  const coin = opts.coin.toUpperCase();
  const anchor = classifyAnchor(coin);
  const scope = opts.scope ?? 'thesis';

  const [btc, eth, altMom] = await Promise.all([
    fetchMomentum('BTCUSDT'),
    fetchMomentum('ETHUSDT'),
    coin === 'BTC' || coin === 'ETH'
      ? Promise.resolve(null)
      : fetchMomentum(hlCoinToBinanceSymbol(coin)),
  ]);
  btcLeadMom = btc;
  btcLeadAt = Date.now();

  const snapshot: MacroBetaSnapshot = {
    coin,
    anchor,
    btc,
    eth,
    coinMom: coin === 'BTC' ? btc : coin === 'ETH' ? eth : (altMom as MacroMomentum),
    checkedAt: new Date().toISOString(),
  };

  const blockers: string[] = [];

  if (opts.direction === 'SHORT') {
    blockers.push(...isPumping(snapshot.coinMom, coin, true));
    if (scope === 'open' && isPumpFollowMajor(coin)) {
      const liveHits: string[] = [];
      if (isLivePumpHappening(btc) || isPumping(btc, 'BTC', false).length > 0) {
        liveHits.push(
          `BTC live 1h ${btc.live1hBarPct >= 0 ? '+' : ''}${btc.live1hBarPct.toFixed(2)}%`
        );
      }
      if (isLivePumpHappening(snapshot.coinMom) || isPumping(snapshot.coinMom, coin, true).length > 0) {
        liveHits.push(
          `${coin} live 1h ${snapshot.coinMom.live1hBarPct >= 0 ? '+' : ''}${snapshot.coinMom.live1hBarPct.toFixed(2)}%`
        );
      }
      if (liveHits.length > 0) {
        blockers.push(`No SHORT ${coin} while pump is live — ${liveHits.join('; ')}`);
      }
    } else if (scope === 'open' && isPumping(btc, 'BTC', false).length > 0) {
      const coinDumping = isDumping(snapshot.coinMom, coin, true).length > 0;
      if (!coinDumping) {
        blockers.push(
          `BTC pumping (live 1h ${btc.live1hBarPct >= 0 ? '+' : ''}${btc.live1hBarPct.toFixed(2)}%) — ${coin} not dumping`
        );
      }
    }
  } else {
    blockers.push(...isDumping(snapshot.coinMom, coin, true));
  }

  const macroSummary = [fmtMom(coin, snapshot.coinMom)];
  if (coin !== 'BTC') macroSummary.push(fmtMom('BTC', btc));

  if (blockers.length > 0) {
    const reason =
      opts.direction === 'SHORT' && blockers.some((b) => b.startsWith('BTC '))
        ? `BTC lead BLOCK SHORT ${coin} — ${blockers.join('; ')} ‖ ${macroSummary.join(' ‖ ')}`
        : `Per-coin momentum BLOCK ${opts.direction} ${coin} — ${blockers.join('; ')} ‖ ${macroSummary.join(' ‖ ')}`;
    logger.info('Macro beta gate blocked entry', {
      coin,
      direction: opts.direction,
      anchor,
      blockers,
      btc15m: btc.change15mPct,
      btcLive1h: btc.live1hBarPct,
      eth15m: eth.change15mPct,
      coin15m: snapshot.coinMom.change15mPct,
    });
    return { ok: false, reason, snapshot, blockers };
  }

  const reason =
    opts.direction === 'SHORT'
      ? `BTC lead OK SHORT ${coin} — ${isPumping(btc, 'BTC', false).length ? `${coin} dumping vs BTC pump` : 'BTC not pumping'} ‖ ${macroSummary.join(' ‖ ')}`
      : `Per-coin momentum OK LONG ${coin} — ${coin} chart not dumping ‖ ${macroSummary.join(' ‖ ')}`;

  return { ok: true, reason, snapshot, blockers: [] };
}

export async function validateMacroBetaAlignment(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<MacroBetaResult> {
  try {
    return await evaluateMacroBetaAlignment({ ...opts, scope: 'open' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Macro beta gate error — fail closed for alts', {
      coin: opts.coin,
      direction: opts.direction,
      error: msg,
    });
    const coin = opts.coin.toUpperCase();
    const emptySnap = {
      coin,
      anchor: classifyAnchor(coin),
      btc: emptyMacroMomentum(),
      eth: emptyMacroMomentum(),
      coinMom: emptyMacroMomentum(),
      checkedAt: new Date().toISOString(),
    };
    if (coin === 'BTC' || coin === 'ETH') {
      return {
        ok: true,
        reason: 'Macro beta check failed — majors allowed',
        snapshot: emptySnap,
        blockers: [],
      };
    }
    return {
      ok: false,
      reason: `Macro beta check failed — entry blocked (${msg.slice(0, 80)})`,
      snapshot: emptySnap,
      blockers: ['macro data unavailable'],
    };
  }
}
