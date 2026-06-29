import type { UnifiedSignal } from './signalService';
import { MIN_HL_BOT_USD } from './hyperliquid/hlBotAgent';
import { isInternalPlatformOpsMessage } from './hyperliquid/builderPlatform';
import { isBotScanNoiseDetail } from './hlBotReasonLabels';
import {
  HL_MAX_CONCURRENT_POSITIONS,
  HL_MIN_SIGNAL_CONFIDENCE,
} from './hlBotConstants';

export type BotReadiness = {
  canEnter: boolean;
  headline: string;
  detail: string;
};

const USER_SETUP_BLOCKER =
  /HL agent not approved|builder fee|platform fee|HL balance|Must deposit|auto-trade disabled|notional.*below min|margin too small|free margin too low/i;

function formatBlocker(blocker: string): string {
  if (isInternalPlatformOpsMessage(blocker)) return '';
  if (isBotScanNoiseDetail(blocker)) return '';
  if (/HL agent not approved/i.test(blocker)) {
    return 'Approve the trading agent in the Bot panel';
  }
  if (/HL balance/i.test(blocker)) {
    return blocker.replace(/HL balance/i, 'HL balance');
  }
  if (/builder fee|platform fee/i.test(blocker)) {
    return 'Approve the Hyperliquid platform fee in the Bot panel';
  }
  if (/Cautious alt.*confidence.*below/i.test(blocker)) {
    return '';
  }
  if (
    /top-pairs fallback|relaxed scan|no HL perp passed global scan|Pre-trade gate|volume\/liquidity|volume\/sweep|Mega pair OUTFLOW|outflow blocks|win rate gate|bot banned|Cautious alt|no trade signal|MTF|bot conf|HL order failed|HL position open/i.test(
      blocker
    )
  ) {
    return '';
  }
  if (/notional.*below min/i.test(blocker)) {
    return blocker.replace(
      /raise risk % or leverage/i,
      'raise Risk % or LVRG in bot settings, or deposit more USDC'
    );
  }
  if (/short-window|SHORT only|Fri \d{1,2}:00 MES/i.test(blocker)) {
    return '';
  }
  if (/HL max positions/i.test(blocker)) {
    return '';
  }
  if (/Trade size too small|notional.*below min/i.test(blocker)) {
    return 'Trade size below $20 min — raise Risk % or LVRG, or deposit more USDC';
  }
  if (/Must deposit before performing actions/i.test(blocker)) {
    return 'Deposit USDC on Hyperliquid first (min $20)';
  }
  if (/margin too small|free margin too low/i.test(blocker)) {
    const m = blocker.match(/\$([\d.]+).*balance \$([\d.]+)/i);
    if (m) {
      return `Waiting for margin — ~$${m[1]} usable from $${m[2]} on HL (lower Risk % in LVRG or deposit more for a 2nd trade)`;
    }
    return 'Not enough free margin for another trade — lower Risk % in LVRG or deposit more USDC';
  }
  if (/HL balance \$([\d.]+).*min \$([\d.]+)/i.test(blocker)) {
    const m = blocker.match(/HL balance \$([\d.]+).*min \$([\d.]+)/i);
    if (m) {
      return `HL balance $${m[1]} — need $${m[2]}+ on Hyperliquid to trade`;
    }
  }
  if (/Perp margin \$|HL perp balance/i.test(blocker)) {
    return blocker;
  }
  if (/HL balance check failed/i.test(blocker)) {
    return 'Checking your Hyperliquid balance — retrying…';
  }
  return blocker;
}

export function readinessFromServerBlockers(blockers: string[]): BotReadiness {
  const actionable = blockers
    .filter((b) => USER_SETUP_BLOCKER.test(b))
    .map((b) => formatBlocker(b))
    .filter(Boolean);
  const unique = [...new Set(actionable)];
  const hasAgentBlocker = unique.some((b) => /trading agent/i.test(b));
  const detail = (
    hasAgentBlocker
      ? unique.filter((b) => !/Checking your Hyperliquid balance|retrying/i.test(b))
      : unique
  ).join(' · ');
  return {
    canEnter: false,
    headline: detail ? 'Setup needed' : 'Scanning markets',
    detail,
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
      headline: 'Managing trades',
      detail: '',
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
      headline: 'Scanning markets',
      detail: '',
    };
  }

  const next = opts.nextSetup;
  const nextConf = next ? Math.round(next.confidence) : 0;
  const conf = Math.round(signal?.confidence ?? nextConf);
  const direction = signal?.direction ?? next?.direction ?? 'HOLD';
  const minConf = HL_MIN_SIGNAL_CONFIDENCE;
  const strong = conf >= minConf && direction !== 'HOLD';

  if (strong) {
    return {
      canEnter: true,
      headline: 'Opening trade',
      detail: '',
    };
  }

  return {
    canEnter: false,
    headline: 'Scanning markets',
    detail: '',
  };
}
