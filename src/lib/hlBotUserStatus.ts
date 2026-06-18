import type { BotReadiness } from './botReadiness';
import { MIN_HL_BOT_USD } from './hyperliquid/hlBotAgent';

export type HlSetupPhase = 'connect' | 'loading' | 'approve' | 'fund' | 'ready';

export type HlBotSidebarStatus = {
  headline: string;
  detail: string;
  tone: 'neutral' | 'warn' | 'ok' | 'active';
  setupStep: 1 | 2 | 3 | 4;
  setupComplete: boolean;
};

function simplifyBlocker(raw: string): string {
  if (/HL agent not approved/i.test(raw)) {
    return 'Trading agent not approved yet';
  }
  if (/builder fee|platform fee/i.test(raw)) {
    return 'Approve the Hyperliquid platform fee in the Bot panel';
  }
  if (/HL balance|HL-Guthaben/i.test(raw)) {
    return raw.replace(/HL balance/i, 'HL balance').replace(/HL-Guthaben/i, 'HL balance');
  }
  if (/no trade signal|MTF|bot conf/i.test(raw)) {
    return 'No strong trade setup right now — bot keeps scanning';
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
  hasOpenPosition: boolean;
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
    hasOpenPosition,
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
  const needsBuilderFee = builderFeeEnabled && !builderFeeApproved;
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
      return {
        headline: 'Approve on Hyperliquid',
        detail: needsAgent
          ? 'One-time wallet signature(s): trading agent (trade only, no withdrawals) and Monadier platform fee on perp orders.'
          : 'Approve the Monadier platform fee on Hyperliquid (one-time) — required for bot orders.',
        tone: 'warn',
        setupStep: 3,
        setupComplete: false,
      };
    }
    return {
      headline: 'Ready',
      detail: 'Account funded and approvals complete. Press Start bot below — deposit alone does not start trading.',
      tone: 'ok',
      setupStep: 4,
      setupComplete: true,
    };
  }

  const timer = runtimeLabel ? ` · ${runtimeLabel}` : '';

  if (hasOpenPosition) {
    return {
      headline: `Running${timer}`,
      detail: 'Managing your open Hyperliquid position.',
      tone: 'active',
      setupStep: 4,
      setupComplete: true,
    };
  }

  if (serverBlockers.length > 0) {
    return {
      headline: `Running${timer}`,
      detail: formatServerBlockers(serverBlockers),
      tone: 'active',
      setupStep: 4,
      setupComplete: true,
    };
  }

  if (readiness && !readiness.canEnter) {
    return {
      headline: `Running${timer}`,
      detail: readiness.detail,
      tone: 'active',
      setupStep: 4,
      setupComplete: true,
    };
  }

  return {
    headline: `Running${timer}`,
    detail: 'Scanning Hyperliquid markets — opens a trade when setup looks good.',
    tone: 'active',
    setupStep: 4,
    setupComplete: true,
  };
}
