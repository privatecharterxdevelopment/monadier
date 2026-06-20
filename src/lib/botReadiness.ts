import type { UnifiedSignal } from './signalService';
import { MIN_HL_BOT_USD } from './hyperliquid/hlBotAgent';
import { HL_MAX_CONCURRENT_POSITIONS } from './hlBotConstants';

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
  if (/builder fee|platform fee/i.test(blocker)) {
    return 'Approve the Hyperliquid platform fee in the Bot panel';
  }
  if (/no trade signal|MTF|bot conf/i.test(blocker)) {
    return 'No strong trade setup yet — bot keeps scanning';
  }
  if (/HL max positions/i.test(blocker)) {
    return blocker.replace(/HL max positions/i, 'All bot slots in use');
  }
  if (/HL position open/i.test(blocker)) {
    return `Open position: ${blocker.replace(/HL position open:\s*/i, '')}`;
  }
  if (/Must deposit before performing actions/i.test(blocker)) {
    return 'Deposit USDC on Hyperliquid first (min $20)';
  }
  if (/margin too small/i.test(blocker)) {
    const m = blocker.match(/\$([\d.]+).*balance \$([\d.]+)/i);
    if (m) {
      return `Not enough margin for next trade (~$${m[1]} from $${m[2]} on HL) — deposit more or lower risk in LVRG`;
    }
    return 'Not enough margin for a leverage trade — deposit more or lower risk in LVRG';
  }
  if (/HL balance \$([\d.]+).*min \$([\d.]+)/i.test(blocker)) {
    const m = blocker.match(/HL balance \$([\d.]+).*min \$([\d.]+)/i);
    if (m) {
      return `HL balance $${m[1]} — need $${m[2]}+ on Hyperliquid to trade`;
    }
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
    openPositionsCount: number;
    maxConcurrentPositions?: number;
    vaultUsd: number;
    minVaultUsd?: number;
    /** @deprecated use openPositionsCount */
    hasOpenPosition?: boolean;
  }
): BotReadiness {
  const minCapital = opts.minVaultUsd ?? MIN_HL_BOT_USD;
  const maxSlots = opts.maxConcurrentPositions ?? HL_MAX_CONCURRENT_POSITIONS;
  const openCount =
    opts.openPositionsCount ??
    (opts.hasOpenPosition ? maxSlots : 0);

  if (!opts.autoTradeEnabled) {
    return {
      canEnter: false,
      headline: 'Bot off',
      detail: 'Complete deposit and agent approval, then press Start bot.',
    };
  }

  if (openCount >= maxSlots) {
    return {
      canEnter: false,
      headline: `${openCount}/${maxSlots} slots full`,
      detail: 'The bot is managing all active trades.',
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
  const slotLabel =
    openCount > 0
      ? `slot ${openCount + 1}/${maxSlots}`
      : `up to ${maxSlots} trades`;

  if (strong) {
    return {
      canEnter: true,
      headline: openCount > 0 ? `Scanning ${slotLabel}` : 'Ready to trade',
      detail:
        openCount > 0
          ? `${signal.direction} setup — bot may open a 2nd high-liquidity pair`
          : `${signal.direction} setup found — next bot cycle ~10s`,
    };
  }

  return {
    canEnter: false,
    headline: openCount > 0 ? `Managing ${openCount} trade(s)` : 'Scanning markets',
    detail:
      openCount > 0
        ? `Scanning for ${slotLabel} on high-volume HL perps…`
        : 'Waiting for a strong trade setup on Hyperliquid.',
  };
}
