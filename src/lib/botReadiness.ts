import type { UnifiedSignal } from './signalService';
import { MIN_HL_BOT_USD } from './hyperliquid/hlBotAgent';

/** Matches bot aggressive strategy floor (see bot-service market STRATEGY_CONFIGS). */
export const BOT_MIN_CONFIDENCE_AGGRESSIVE = 25;

export type BotReadiness = {
  canEnter: boolean;
  headline: string;
  detail: string;
};

function formatBlocker(blocker: string): string {
  if (/HL agent not approved/i.test(blocker)) {
    return 'Trading-Agent auf Hyperliquid noch nicht freigegeben';
  }
  if (/HL balance/i.test(blocker)) {
    return blocker.replace(/HL balance/i, 'HL-Guthaben');
  }
  if (/no trade signal/i.test(blocker)) {
    return 'Kein starkes MTF-Signal (min. 25% bot conf.)';
  }
  if (/HL position open/i.test(blocker)) {
    return `Offene HL-Position: ${blocker.replace(/HL position open:\s*/i, '')}`;
  }
  return blocker;
}

export function readinessFromServerBlockers(blockers: string[]): BotReadiness {
  return {
    canEnter: false,
    headline: 'Bot blockiert',
    detail: blockers.map((b) => formatBlocker(b)).join(' · '),
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
