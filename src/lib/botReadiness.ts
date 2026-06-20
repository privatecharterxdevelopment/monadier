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
  if (/no HL perp passed global scan/i.test(blocker)) {
    return 'No pair passed bot gates (55%+ conf, 3 aligned TFs, volume sweep)';
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
  if (/margin too small|free margin too low/i.test(blocker)) {
    const m = blocker.match(/\$([\d.]+).*balance \$([\d.]+)/i);
    if (m) {
      return `Not enough margin for next trade (~$${m[1]} from $${m[2]} on HL) — deposit more or lower risk in LVRG`;
    }
    return 'Not enough free margin for a 2nd trade — deposit more or lower risk in LVRG';
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

export type BotScanSetup = {
  coin: string;
  direction: string;
  confidence: number;
  reason?: string;
};

export function evaluateBotReadiness(
  signal: UnifiedSignal | null,
  opts: {
    autoTradeEnabled: boolean;
    openPositionsCount: number;
    maxConcurrentPositions?: number;
    vaultUsd: number;
    minVaultUsd?: number;
    /** Global scan target for the next free slot (independent high-volume pair). */
    nextSetup?: BotScanSetup | null;
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

  if (!signal && !opts.nextSetup) {
    return {
      canEnter: false,
      headline: openCount > 0 ? `Slot ${openCount + 1} scan` : 'Bot active',
      detail:
        openCount > 0
          ? 'Scanning high-volume HL perps for an independent 2nd trade…'
          : 'Loading market data…',
    };
  }

  const next = opts.nextSetup;
  const nextConf = next ? Math.round(next.confidence) : 0;
  const conf = Math.round(signal?.confidence ?? nextConf);
  const direction = signal?.direction ?? next?.direction ?? 'HOLD';
  const strong =
    conf >= BOT_MIN_CONFIDENCE_AGGRESSIVE && direction !== 'HOLD';
  const slotLabel =
    openCount > 0
      ? `slot ${openCount + 1}/${maxSlots}`
      : `up to ${maxSlots} trades`;
  const independentPair =
    openCount > 0 && next?.coin
      ? `${next.coin} ${next.direction} (${nextConf}%)`
      : null;

  if (strong) {
    return {
      canEnter: true,
      headline: openCount > 0 ? `Slot ${openCount + 1}: ${next?.coin ?? 'scanning'}` : 'Ready to trade',
      detail:
        openCount > 0 && independentPair
          ? `Independent ${independentPair} — high-volume pair, separate from open trade`
          : `${direction} setup found — next bot cycle ~10s`,
    };
  }

  return {
    canEnter: false,
    headline: openCount > 0 ? `Slot ${openCount + 1} scan` : 'Scanning markets',
    detail:
      openCount > 0
        ? independentPair
          ? `Analyzing ${independentPair} on high-volume HL perps (not your open pair)…`
          : `Scanning ${slotLabel} on high-volume HL perps…`
        : 'Waiting for a strong trade setup on Hyperliquid.',
  };
}
