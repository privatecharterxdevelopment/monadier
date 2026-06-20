import type { BotReadiness } from './botReadiness';
import { MIN_HL_BOT_USD } from './hyperliquid/hlBotAgent';
import { HL_MAX_CONCURRENT_POSITIONS } from './hlBotConstants';

export type HlSetupPhase = 'connect' | 'loading' | 'approve' | 'fund' | 'ready';

export type HlBotSidebarStatus = {
  headline: string;
  detail: string;
  tone: 'neutral' | 'warn' | 'ok' | 'active';
  setupStep: 1 | 2 | 3;
  setupComplete: boolean;
};

function simplifyBlocker(raw: string): string {
  if (/HL agent not approved/i.test(raw)) {
    return 'Trading agent not approved yet';
  }
  if (/builder fee|platform fee/i.test(raw)) {
    return 'Press Start bot to approve the Hyperliquid platform fee';
  }
  if (/HL balance|HL-Guthaben/i.test(raw)) {
    return raw.replace(/HL balance/i, 'HL balance').replace(/HL-Guthaben/i, 'HL balance');
  }
  if (/no trade signal|MTF|bot conf/i.test(raw)) {
    return 'No strong trade setup right now — bot keeps scanning';
  }
  if (/HL max positions/i.test(raw)) {
    return 'All bot slots in use — managing open trades';
  }
  if (/HL position open/i.test(raw)) {
    return 'Managing an open position';
  }
  if (/auto-trade disabled/i.test(raw)) {
    return 'Auto-trading is off in settings';
  }
  if (/Must deposit before performing actions/i.test(raw)) {
    return 'Deposit USDC on Hyperliquid first (min $20)';
  }
  if (/margin too small/i.test(raw)) {
    const m = raw.match(/\$([\d.]+).*balance \$([\d.]+)/i);
    if (m) {
      return `Not enough free margin for the next trade (~$${m[1]} usable from $${m[2]} HL balance) — deposit more or lower risk % in LVRG`;
    }
    return 'Not enough free margin for a leverage trade — deposit more or lower risk % in LVRG';
  }
  if (/HL balance \$([\d.]+).*min \$([\d.]+)/i.test(raw)) {
    const m = raw.match(/HL balance \$([\d.]+).*min \$([\d.]+)/i);
    if (m) {
      return `Hyperliquid balance $${m[1]} — need at least $${m[2]} USDC on HL to run the bot`;
    }
  }
  return raw;
}

export function formatServerBlockers(blockers: string[]): string {
  return blockers.map(simplifyBlocker).join(' · ');
}

export function getHlBotSidebarStatus(opts: {
  walletReady: boolean;
  phase: HlSetupPhase;
  botRunning: boolean;
  hlBalanceUsd: number;
  agentApproved: boolean;
  builderFeeApproved?: boolean;
  builderFeeEnabled?: boolean;
  builderPlatformReady?: boolean;
  hasOpenPosition: boolean;
  openPositionsCount?: number;
  maxConcurrentPositions?: number;
  nextSetupReason?: string | null;
  serverBlockers?: string[];
  readiness?: BotReadiness | null;
  runtimeLabel?: string;
}): HlBotSidebarStatus {
  const {
    walletReady,
    phase,
    botRunning,
    hlBalanceUsd,
    agentApproved,
    builderFeeApproved = true,
    builderFeeEnabled = false,
    builderPlatformReady = true,
    hasOpenPosition,
    openPositionsCount = hasOpenPosition ? 1 : 0,
    maxConcurrentPositions = HL_MAX_CONCURRENT_POSITIONS,
    nextSetupReason,
    serverBlockers = [],
    readiness,
    runtimeLabel,
  } = opts;

  if (!walletReady) {
    return {
      headline: 'Connect wallet',
      detail: 'Use the same wallet you use on Hyperliquid.',
      tone: 'neutral',
      setupStep: 1,
      setupComplete: false,
    };
  }

  if (phase === 'loading') {
    return {
      headline: 'Loading…',
      detail: 'Checking your Hyperliquid account.',
      tone: 'neutral',
      setupStep: 1,
      setupComplete: false,
    };
  }

  const needsDeposit = hlBalanceUsd < MIN_HL_BOT_USD;
  const needsAgent = !agentApproved;
  const needsBuilderFee =
    builderFeeEnabled && builderPlatformReady && !builderFeeApproved;
  const needsApprove = needsAgent || needsBuilderFee;

  if (!botRunning) {
    if (needsDeposit) {
      return {
        headline: 'Fund your account',
        detail: `Deposit at least $${MIN_HL_BOT_USD} USDC on Hyperliquid to start the bot. Funds stay in your account — only your wallet can withdraw; the trading agent cannot.`,
        tone: 'warn',
        setupStep: 2,
        setupComplete: false,
      };
    }
    if (needsApprove) {
      const funded = hlBalanceUsd >= MIN_HL_BOT_USD;
      return {
        headline: funded ? 'Allow trading (one-time)' : 'Start bot',
        detail: funded
          ? `Your HL balance ($${hlBalanceUsd.toFixed(2)}) is enough. Press Start bot — MetaMask asks to allow trading, not to withdraw USDC. It may show a generic safety warning; that is normal for Hyperliquid API approvals.`
          : needsAgent
            ? 'Press Start bot below — includes one-time Hyperliquid signatures (trading agent + platform fee, 1–2 wallet confirmations).'
            : 'Press Start bot below — includes one-time platform fee approval on Hyperliquid.',
        tone: 'warn',
        setupStep: 3,
        setupComplete: false,
      };
    }
    return {
      headline: 'Ready',
      detail: 'Account funded. Press Start bot below — deposit alone does not start trading.',
      tone: 'ok',
      setupStep: 3,
      setupComplete: true,
    };
  }

  const timer = runtimeLabel ? ` · ${runtimeLabel}` : '';

  if (hasOpenPosition) {
    const slotsFull = openPositionsCount >= maxConcurrentPositions;
    const slotDetail = slotsFull
      ? `Managing ${openPositionsCount} open trade(s)`
      : `Managing ${openPositionsCount} trade(s) · scanning slot ${openPositionsCount + 1}/${maxConcurrentPositions}`;
    const reasonLine = nextSetupReason?.trim();
    return {
      headline: `Running${timer}`,
      detail: slotsFull
        ? slotDetail
        : [
            slotDetail,
            reasonLine ? `Next: ${reasonLine}` : null,
            serverBlockers.length > 0 ? formatServerBlockers(serverBlockers) : null,
          ]
            .filter(Boolean)
            .join(' · '),
      tone: 'active',
      setupStep: 3,
      setupComplete: true,
    };
  }

  if (serverBlockers.length > 0) {
    return {
      headline: `Running${timer}`,
      detail: formatServerBlockers(serverBlockers),
      tone: 'active',
      setupStep: 3,
      setupComplete: true,
    };
  }

  if (readiness && !readiness.canEnter) {
    return {
      headline: `Running${timer}`,
      detail: readiness.detail,
      tone: 'active',
      setupStep: 3,
      setupComplete: true,
    };
  }

  return {
    headline: `Running${timer}`,
    detail: 'Scanning Hyperliquid markets — opens a trade when setup looks good.',
    tone: 'active',
    setupStep: 3,
    setupComplete: true,
  };
}
