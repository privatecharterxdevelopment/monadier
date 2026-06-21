import type { UnifiedSignal } from './signalService';
import { MIN_HL_BOT_USD } from './hyperliquid/hlBotAgent';
import { isInternalPlatformOpsMessage } from './hyperliquid/builderPlatform';
import {
  HL_BOT_CYCLE_SEC,
  HL_MAX_CONCURRENT_POSITIONS,
  HL_MIN_SIGNAL_CONFIDENCE,
} from './hlBotConstants';

export type BotReadiness = {
  canEnter: boolean;
  headline: string;
  detail: string;
};

function formatBlocker(blocker: string): string {
  if (isInternalPlatformOpsMessage(blocker)) return '';
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
    return '';
  }
  if (/Pre-trade gate blocked|volume\/liquidity|volume\/sweep/i.test(blocker)) {
    return blocker;
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
  if (/HL order failed/i.test(blocker)) {
    return blocker;
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
  const detail = blockers
    .map((b) => formatBlocker(b))
    .filter(Boolean)
    .join(' · ');
  return {
    canEnter: false,
    headline: detail ? 'Bot waiting' : 'Scanning markets',
    detail,
  };
}

export type BotScanSetup = {
  coin: string;
  direction: string;
  confidence: number;
  reason?: string;
};

function setupLabel(setup: BotScanSetup | null | undefined): string | null {
  if (!setup?.coin || !setup.direction || setup.direction === 'HOLD') return null;
  const conf = Math.round(setup.confidence);
  return `${setup.coin} ${setup.direction} ${conf}%`;
}

export function evaluateBotReadiness(
  signal: UnifiedSignal | null,
  opts: {
    autoTradeEnabled: boolean;
    openPositionsCount: number;
    maxConcurrentPositions?: number;
    vaultUsd: number;
    minVaultUsd?: number;
    /** Global scan target for the next free slot (independent pair). */
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
          ? 'Scanning all HL perps for an independent 2nd trade…'
          : 'Loading market data…',
    };
  }

  const next = opts.nextSetup;
  const nextConf = next ? Math.round(next.confidence) : 0;
  const conf = Math.round(signal?.confidence ?? nextConf);
  const direction = signal?.direction ?? next?.direction ?? 'HOLD';
  const label = setupLabel(next) ?? (direction !== 'HOLD' ? `${direction} ${conf}%` : null);
  const minConf = HL_MIN_SIGNAL_CONFIDENCE;
  const strong = conf >= minConf && direction !== 'HOLD';
  const slotLabel =
    openCount > 0
      ? `slot ${openCount + 1}/${maxSlots}`
      : `up to ${maxSlots} trades`;
  const cycleHint =
    HL_BOT_CYCLE_SEC <= 1 ? 'next cycle (~1s)' : `next cycle (~${HL_BOT_CYCLE_SEC}s)`;

  if (strong && label) {
    return {
      canEnter: true,
      headline: openCount > 0 ? `Slot ${openCount + 1}: ${next?.coin ?? 'signal'}` : 'Opening trade',
      detail:
        openCount > 0
          ? `${label} — independent pair, ${cycleHint}`
          : `${label} — bot tries to open on ${cycleHint}`,
    };
  }

  return {
    canEnter: false,
    headline: openCount > 0 ? `Slot ${openCount + 1} scan` : 'Scanning markets',
    detail:
      label && conf > 0 && conf < minConf
        ? `${label} below ${minConf}% threshold — still scanning`
        : openCount > 0
          ? label
            ? `Analyzing ${label} across HL perps (not your open pair)…`
            : `Scanning ${slotLabel} across all HL perps…`
          : 'Waiting for a strong trade setup on Hyperliquid.',
  };
}
