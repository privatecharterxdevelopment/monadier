import type { UnifiedSignal } from './signalService';
import { MIN_HL_BOT_USD } from './hyperliquid/hlBotAgent';

/** Matches bot aggressive strategy floor (see bot-service market STRATEGY_CONFIGS). */
export const BOT_MIN_CONFIDENCE_AGGRESSIVE = 25;

export type BotReadiness = {
  canEnter: boolean;
  headline: string;
  detail: string;
  /** Server-side GMX circuit breaker — signal confidence does not override this. */
  circuitBreaker?: boolean;
  circuitBreakerResetSec?: number;
};

function formatBlocker(blocker: string, resetSec?: number): string {
  const cb = blocker.match(/circuit breaker \((\d+) recent GMX failures\)/i);
  if (cb) {
    const n = cb[1];
    const wait =
      resetSec && resetSec > 0
        ? ` · Reset in ~${Math.ceil(resetSec / 60)} Min.`
        : ' · Reset in ~5 Min.';
    return `${n} fehlgeschlagene GMX-Orders — Bot pausiert${wait}`;
  }
  const keeperCb = blocker.match(/circuit breaker \((\d+) GMX keeper timeouts\)/i);
  if (keeperCb) {
    const wait =
      resetSec && resetSec > 0
        ? ` · Reset in ~${Math.ceil(resetSec / 60)} Min.`
        : ' · Reset in ~5 Min.';
    return `${keeperCb[1]}× GMX Keeper Timeout — Bot wartet${wait}`;
  }
  if (/HL agent not approved/i.test(blocker)) {
    return 'Trading-Agent auf Hyperliquid noch nicht freigegeben';
  }
  if (/HL balance/i.test(blocker)) {
    return blocker.replace(/HL balance/i, 'HL-Guthaben');
  }
  if (/post-close cooldown/i.test(blocker)) {
    const sec = blocker.match(/(\d+)s/)?.[1];
    return sec ? `Cooldown nach Schließen: noch ${sec}s` : 'Cooldown nach Schließen aktiv';
  }
  if (/no trade signal/i.test(blocker)) {
    return 'Kein starkes MTF-Signal (min. 25% bot conf.)';
  }
  if (/HL position open/i.test(blocker)) {
    return `Offene HL-Position: ${blocker.replace(/HL position open:\s*/i, '')}`;
  }
  if (/on-chain position open/i.test(blocker)) {
    return `Offene Position: ${blocker.replace(/on-chain position open:\s*/i, '')}`;
  }
  return blocker;
}

export function readinessFromServerBlockers(
  blockers: string[],
  resetSec = 0
): BotReadiness {
  const circuitBreaker = blockers.some((b) => /circuit breaker/i.test(b));
  const detail = blockers.map((b) => formatBlocker(b, resetSec)).join(' · ');

  if (circuitBreaker) {
    return {
      canEnter: false,
      headline: 'GMX Circuit Breaker',
      detail,
      circuitBreaker: true,
      circuitBreakerResetSec: resetSec,
    };
  }

  return {
    canEnter: false,
    headline: 'Bot blockiert',
    detail,
  };
}

export function evaluateBotReadiness(
  signal: UnifiedSignal | null,
  opts: {
    autoTradeEnabled: boolean;
    hasOpenPosition: boolean;
    vaultUsd: number;
    minVaultUsd?: number;
  }
): BotReadiness {
  const minCapital = opts.minVaultUsd ?? MIN_HL_BOT_USD;

  if (!opts.autoTradeEnabled) {
    return {
      canEnter: false,
      headline: 'Bot aus',
      detail: 'Starte den Bot im Bot-Tab.',
    };
  }

  if (opts.hasOpenPosition) {
    return {
      canEnter: false,
      headline: 'Position offen',
      detail: 'Der Bot verwaltet den aktiven Trade.',
    };
  }

  if (opts.vaultUsd < minCapital) {
    return {
      canEnter: false,
      headline: 'Einsatz zu niedrig',
      detail: `Mindestens $${minCapital} USDC auf Hyperliquid für Bot-Trades.`,
    };
  }

  if (!signal) {
    return {
      canEnter: false,
      headline: 'Bot aktiv',
      detail: 'Marktdaten werden geladen…',
    };
  }

  const conf = Math.round(signal.confidence);
  const mixed = signal.warnings?.some((w) => /conflict/i.test(w));
  const strong = conf >= BOT_MIN_CONFIDENCE_AGGRESSIVE && signal.direction !== 'HOLD';

  if (strong) {
    return {
      canEnter: true,
      headline: 'Bereit für Einstieg',
      detail: `${signal.direction} · ${conf}% bot conf · nächster Zyklus ~10s${mixed ? ' (TFs gemischt)' : ''}`,
    };
  }

  const parts: string[] = [];
  if (conf < BOT_MIN_CONFIDENCE_AGGRESSIVE) {
    parts.push(`bot conf ${conf}% (min ${BOT_MIN_CONFIDENCE_AGGRESSIVE}%)`);
  }
  if (signal.direction === 'HOLD') {
    parts.push('keine klare Richtung im MTF-Signal');
  }
  if (mixed) {
    parts.push('Timeframes widersprechen sich — Einzel-TF % zählt nicht');
  }

  return {
    canEnter: false,
    headline: 'Bot aktiv — wartet',
    detail: parts.join(' · ') || 'Signal noch nicht stark genug',
  };
}
