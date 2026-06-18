import type { UnifiedSignal } from './signalService';

/** Matches bot aggressive strategy floor (see bot-service market STRATEGY_CONFIGS). */
export const BOT_MIN_CONFIDENCE_AGGRESSIVE = 25;

export type BotReadiness = {
  canEnter: boolean;
  headline: string;
  detail: string;
};

export function evaluateBotReadiness(
  signal: UnifiedSignal | null,
  opts: {
    autoTradeEnabled: boolean;
    hasOpenPosition: boolean;
    vaultUsd: number;
    minVaultUsd?: number;
  }
): BotReadiness {
  const minVault = opts.minVaultUsd ?? 50;

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

  if (opts.vaultUsd < minVault) {
    return {
      canEnter: false,
      headline: 'Vault zu niedrig',
      detail: `Mindestens $${minVault} USDC im Vault für Bot-Trades.`,
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
  // Match bot aggressive gate: unified conf ≥25, clear direction (HOLD converted server-side).
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
