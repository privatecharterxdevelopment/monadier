import { MIN_HL_BOT_USD } from './hyperliquid/hlBotAgent';
import {
  hlBotSuccessFeeShortLabel,
} from './hyperliquid/hlBotSuccessFee';
import { isInternalPlatformOpsMessage } from './hyperliquid/builderPlatform';

export type HlSetupPhase = 'connect' | 'loading' | 'approve' | 'fund' | 'ready';

export type HlBotSidebarStatus = {
  headline: string;
  detail: string;
  tone: 'neutral' | 'warn' | 'ok' | 'active';
  setupStep: 1 | 2 | 3;
  setupComplete: boolean;
};

function simplifyBlocker(raw: string): string {
  if (isInternalPlatformOpsMessage(raw)) return '';
  if (/SHORT blocked|Pair still pumping|macro against|Macro beta|LONG blocked/i.test(raw)) {
    return raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
  }
  if (/no trade signal|MTF|bot conf|Pre-trade gate|Volume 0\.00x|ETH-beta|BTC-beta| ‖ /.test(raw)) {
    return '';
  }
  if (/HL agent not approved|Trading agent not approved/i.test(raw)) {
    return 'Trading agent not approved yet';
  }
  if (/Hyperliquid temporarily unreachable/i.test(raw)) {
    return 'Checking trading agent — try again in a moment';
  }
  if (/builder fee|platform fee|success fee/i.test(raw)) {
    return `Approve ${hlBotSuccessFeeShortLabel()} first — then Start bot`;
  }
  if (/HL balance check failed|Could not read Hyperliquid balance/i.test(raw)) {
    return '';
  }
  if (/Checking your Hyperliquid balance|retrying/i.test(raw)) {
    return '';
  }
  if (/HL balance|HL-Guthaben/i.test(raw)) {
    return raw.replace(/HL balance/i, 'HL balance').replace(/HL-Guthaben/i, 'HL balance');
  }
  if (/no trade signal|MTF|bot conf/i.test(raw)) {
    return '';
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
  if (/margin too small|free margin too low/i.test(raw)) {
    const m = raw.match(/\$([\d.]+).*balance \$([\d.]+)/i);
    if (m) {
      return `Not enough free margin for the next trade (~$${m[1]} usable from $${m[2]} HL balance) — deposit more or lower risk % in LVRG`;
    }
    return 'Not enough free margin for a 2nd trade — deposit more or lower risk % in LVRG';
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
  accountSignedIn?: boolean;
  phase: HlSetupPhase;
  botRunning: boolean;
  hlBalanceUsd: number;
  perpUsd?: number;
  spotUsdcUsd?: number;
  unifiedAccount?: boolean;
  agentApproved: boolean;
  builderFeeApproved?: boolean;
  builderFeeEnabled?: boolean;
  builderPlatformReady?: boolean;
  runtimeLabel?: string;
}): HlBotSidebarStatus {
  const {
    walletReady,
    accountSignedIn = true,
    phase,
    botRunning,
    hlBalanceUsd,
    perpUsd = hlBalanceUsd,
    spotUsdcUsd = 0,
    unifiedAccount = false,
    agentApproved,
    builderFeeApproved = true,
    builderFeeEnabled = false,
    builderPlatformReady = true,
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

  if (!accountSignedIn) {
    return {
      headline: 'Sign in required',
      detail: 'Sign in to your Monadier account, then press Start bot. Your wallet is already connected.',
      tone: 'warn',
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

  const needsDeposit = perpUsd < MIN_HL_BOT_USD && perpUsd + spotUsdcUsd < MIN_HL_BOT_USD;
  const needsSpotTransfer =
    !unifiedAccount &&
    perpUsd < MIN_HL_BOT_USD &&
    spotUsdcUsd >= MIN_HL_BOT_USD;
  const needsAgent = !agentApproved;
  const needsBuilderFee = builderFeeEnabled && !builderFeeApproved;
  const needsApprove = needsAgent || needsBuilderFee;

  if (!botRunning) {
    if (needsDeposit) {
      return {
        headline: 'Fund your account',
        detail: `Deposit at least $${MIN_HL_BOT_USD} native USDC on Arbitrum only (not BNB or other chains). Funds stay on Hyperliquid — only your wallet can withdraw.`,
        tone: 'warn',
        setupStep: 2,
        setupComplete: false,
      };
    }
    if (needsSpotTransfer) {
      return {
        headline: 'Move USDC to Perps',
        detail: `$${spotUsdcUsd.toFixed(2)} is on HL Spot — deposit again to auto-move on standard accounts, or use Funds → Transfer.`,
        tone: 'warn',
        setupStep: 2,
        setupComplete: false,
      };
    }
    if (needsApprove) {
      const funded = hlBalanceUsd >= MIN_HL_BOT_USD || perpUsd >= MIN_HL_BOT_USD;
      const detail = needsAgent && needsBuilderFee
        ? funded
          ? `Step 1: Approve trading agent · Step 2: ${hlBotSuccessFeeShortLabel()} · then Start bot.`
          : 'Approve trading agent, then success fee, before starting the bot.'
        : needsBuilderFee
          ? builderPlatformReady
            ? `Approve ${hlBotSuccessFeeShortLabel()} on Hyperliquid (separate wallet signature), then Start bot.`
            : 'Success fee approval activating — try again in a minute.'
          : funded
            ? 'Approve the trading agent, then press Start bot.'
            : 'Approve the trading agent before starting the bot.';
      return {
        headline: needsBuilderFee && !needsAgent ? 'Platform builder fee' : 'One-time approval',
        detail,
        tone: 'ok',
        setupStep: 3,
        setupComplete: false,
      };
    }
    return {
      headline: 'Ready',
      detail: `Balance ${hlBalanceUsd.toFixed(2)} — press Start bot.`,
      tone: 'ok',
      setupStep: 3,
      setupComplete: true,
    };
  }

  const timer = runtimeLabel ? ` · ${runtimeLabel}` : '';

  return {
    headline: `Running${timer}`,
    detail: '',
    tone: 'active',
    setupStep: 3,
    setupComplete: true,
  };
}
