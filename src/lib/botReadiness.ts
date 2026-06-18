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
    return 'Approve the trading agent in the Bot panel';
  }
  if (/HL balance/i.test(blocker)) {
    return blocker.replace(/HL balance/i, 'HL balance');
  }
  if (/no trade signal|MTF|bot conf/i.test(blocker)) {
    return 'No strong trade setup yet — bot keeps scanning';
  }
  if (/HL position open/i.test(blocker)) {
    return `Open position: ${blocker.replace(/HL position open:\s*/i, '')}`;
  }
  if (/Must deposit before performing actions/i.test(blocker)) {
    return 'Deposit USDC on Hyperliquid first (min $20)';
  }
  return blocker;
}

export function readinessFromServerBlockers(blockers: string[]): BotReadiness {
  return {
    canEnter: false,
    headline: 'Bot waiting',
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
      headline: 'Bot off',
      detail: 'Press Start bot when you are funded on Hyperliquid.',
    };
  }

  if (opts.hasOpenPosition) {
    return {
      canEnter: false,
      headline: 'Position open',
      detail: 'The bot is managing your active trade.',
    };
  }

  if (opts.vaultUsd < minCapital) {
    return {
      canEnter: false,
      headline: 'Deposit needed',
      detail: `At least $${minCapital} USDC on Hyperliquid to trade.`,
    };
  }

  if (!signal) {
    return {
      canEnter: false,
      headline: 'Bot active',
      detail: 'Loading market data…',
    };
  }

  const conf = Math.round(signal.confidence);
  const strong = conf >= BOT_MIN_CONFIDENCE_AGGRESSIVE && signal.direction !== 'HOLD';

  if (strong) {
    return {
      canEnter: true,
      headline: 'Ready to trade',
      detail: `${signal.direction} setup found — next bot cycle ~10s`,
    };
  }

  return {
    canEnter: false,
    headline: 'Scanning markets',
    detail: 'Waiting for a strong trade setup on Hyperliquid.',
  };
}
