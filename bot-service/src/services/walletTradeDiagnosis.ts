/**
 * Live wallet diagnosis — why the bot is / isn't opening trades right now.
 */
import { config } from '../config';
import { subscriptionService } from './subscription';
import { checkWinRateGate } from './tradeGates';
import { deriveUserHlAgentAddress } from './hlAgent';
import {
  fetchHlClearinghouseState,
  fetchHlPerpFundingSnapshot,
  describeHlPerpBalanceBlocker,
  hlEntrySizingBalanceUsd,
  hlTradableFreeMarginUsd,
  hlOpenPerpCoins,
} from './hlInfo';
import { hlAgentApprovalService } from './hlAgentApprovals';
import { getPlatformFeeStatus, PLATFORM_FEE_WINS_BEFORE_BLOCK } from './platformFees';
import {
  applyOpenUniverseFilters,
  describeNoTradeableSetupBlocker,
  describeOpenUniverseForClient,
} from './marketRegime';
import {
  globalSignalsForBotMode,
  getCachedGlobalScanForApi,
  type GlobalScanResult,
} from './globalMarketScan';
import {
  buildNotionalBelowFloorError,
  capHlEntryCollateralToAvailable,
  marginHeadroomForSlot,
  getLastHlOpenErrorForClient,
  minHlMarginForNotionalFloor,
  resolveHlMarginPerSlot,
  resolveHlOrderLeverage,
} from './hlTrading';
import { fetchRecentFunnelForWallet } from './pipelineFunnelLog';
import { FUNNEL } from './pipelineFunnelReasons';

const HL_CHAIN_ID = 42161;

export type DiagnosisGate = {
  id: string;
  stage: 'config' | 'user' | 'market' | 'pick' | 'open' | 'funnel';
  message: string;
  blocking: boolean;
};

export type WalletTradeDiagnosis = {
  wallet: string;
  canTrade: boolean;
  userReady: boolean;
  marketReady: boolean;
  runnable: boolean;
  wouldProcessOpens: boolean;
  summary: string;
  userBlockers: string[];
  marketBlockers: string[];
  blockers: string[];
  gates: DiagnosisGate[];
  hyperliquid: {
    agentApproved: boolean;
    accountEquityUsd: number;
    sizingBalanceUsd: number;
    perpUsd: number;
    spotUsdcUsd: number;
    tradablePerpUsd: number;
    withdrawableUsd: number;
    unifiedAccount: boolean;
    freeMarginUsd: number;
    openCoins: string[];
    maxConcurrentPositions: number;
    minAccountUsd: number;
    minNotionalUsd: number;
  };
  globalScan: {
    rawCandidateCount: number;
    tradeableCount: number;
    filterReasons: string[];
    best: { coin: string; direction: string; confidence: number } | null;
  };
  recentFunnel: Awaited<ReturnType<typeof fetchRecentFunnelForWallet>>;
  lastOpenError: ReturnType<typeof getLastHlOpenErrorForClient>;
};

function gate(
  id: string,
  stage: DiagnosisGate['stage'],
  message: string,
  blocking: boolean
): DiagnosisGate {
  return { id, stage, message, blocking };
}

export async function diagnoseWalletTrading(
  walletAddress: `0x${string}`,
  opts?: { globalScan?: GlobalScanResult }
): Promise<WalletTradeDiagnosis> {
  const chainId = HL_CHAIN_ID;
  const gates: DiagnosisGate[] = [];
  const userBlockers: string[] = [];
  const marketBlockers: string[] = [];

  const pushUser = (id: string, message: string) => {
    userBlockers.push(message);
    gates.push(gate(id, 'user', message, true));
  };
  const pushMarket = (id: string, message: string) => {
    marketBlockers.push(message);
    gates.push(gate(id, 'market', message, true));
  };
  const pass = (id: string, stage: DiagnosisGate['stage'], message: string) => {
    gates.push(gate(id, stage, message, false));
  };

  const dbSettings = await subscriptionService.getUserTradingSettings(walletAddress, chainId);
  const banStatus = await subscriptionService.getBotBanStatus(walletAddress, chainId);
  const tradePerm = await subscriptionService.canTrade(walletAddress);
  const winRateGate = await checkWinRateGate(
    walletAddress,
    chainId,
    dbSettings.minWinRatePercent,
    dbSettings.minTradesForWinRateGate
  );

  if (!dbSettings.autoTradeEnabled) {
    pushUser('config.auto_trade_off', 'auto-trade disabled in settings');
  } else {
    pass('config.auto_trade_on', 'config', 'auto-trade enabled in DB');
  }

  const hlState = await fetchHlClearinghouseState(walletAddress);
  const hlFunding = await fetchHlPerpFundingSnapshot(walletAddress);
  const hlBalanceUsd = hlFunding.accountEquityUsd;
  const hlSizingBalance = hlEntrySizingBalanceUsd(hlFunding, hlState);
  const hlFreeMargin = hlTradableFreeMarginUsd(hlFunding, hlState);
  const hlAgentAddr = deriveUserHlAgentAddress(walletAddress);
  const hlAgentOk = await hlAgentApprovalService.isApproved(walletAddress, hlAgentAddr);
  const hlAgentBlocker = hlAgentOk
    ? null
    : await hlAgentApprovalService.describeAgentBlocker(walletAddress, hlAgentAddr);
  const feeSummary = await getPlatformFeeStatus(walletAddress);
  const hlOpenCoins = hlOpenPerpCoins(hlState);
  const maxPositions = config.hyperliquid.maxConcurrentPositions;

  if (hlAgentOk) {
    pass(FUNNEL.user.agent, 'user', 'HL agent approved on-chain');
  } else {
    pushUser(FUNNEL.user.agent, hlAgentBlocker ?? 'HL agent not approved — enable bot in app');
  }

  if (feeSummary.opensBlocked) {
    pushUser(
      FUNNEL.user.platformFees,
      `PLATFORM_FEES_DUE — pay ${feeSummary.accruedUsd.toFixed(2)} USDC after ${feeSummary.successWinCount} winning closes`
    );
  } else if (feeSummary.withdrawBlocked) {
    pass(
      FUNNEL.user.platformFees,
      'user',
      `Fees owed $${feeSummary.accruedUsd.toFixed(2)} — withdraw blocked in app (${feeSummary.successWinCount}/${PLATFORM_FEE_WINS_BEFORE_BLOCK} wins, bot opens OK)`
    );
  } else {
    pass(
      FUNNEL.user.platformFees,
      'user',
      `Platform fees OK (${feeSummary.successWinCount}/${PLATFORM_FEE_WINS_BEFORE_BLOCK} wins)`
    );
  }

  if (!tradePerm.allowed) {
    pushUser(FUNNEL.user.subscription, tradePerm.reason ?? 'subscription not allowed');
  } else {
    pass(FUNNEL.user.subscription, 'user', `Subscription OK (${tradePerm.planTier})`);
  }

  if (banStatus.isBanned) {
    pushUser(
      FUNNEL.user.ban,
      `bot banned until ${banStatus.bannedUntil?.toISOString() ?? 'unknown'}`
    );
  }

  if (!winRateGate.allowed) {
    pushUser(FUNNEL.user.winRate, winRateGate.reason ?? 'win rate gate');
  }

  const balanceBlocker =
    hlAgentOk || hlFunding.stateLoaded
      ? describeHlPerpBalanceBlocker(hlFunding, config.hyperliquid.minAccountUsd)
      : null;
  const balanceReadFlake =
    balanceBlocker != null && /HL balance check failed/i.test(balanceBlocker);

  if (balanceBlocker && !balanceReadFlake) {
    pushUser(FUNNEL.user.balance, balanceBlocker);
  } else if (hlBalanceUsd >= config.hyperliquid.minAccountUsd) {
    pass(
      FUNNEL.user.balance,
      'user',
      `HL equity $${hlBalanceUsd.toFixed(2)} (min $${config.hyperliquid.minAccountUsd})`
    );
  }

  if (hlOpenCoins.length >= maxPositions) {
    pushUser(
      FUNNEL.user.maxPositions,
      `HL max positions (${hlOpenCoins.length}/${maxPositions}): ${hlOpenCoins.join(', ')}`
    );
  } else {
    pass(
      FUNNEL.user.maxPositions,
      'user',
      `Position slots ${hlOpenCoins.length}/${maxPositions} free`
    );
  }

  const globalScan = opts?.globalScan ?? getCachedGlobalScanForApi();

  const rawUserSignals = globalSignalsForBotMode(globalScan, dbSettings.hlBotStrategy);
  const { signals: userSignals, reasons: filterReasons } = applyOpenUniverseFilters(
    rawUserSignals,
    globalScan
  );
  const openCoinSet = new Set(hlOpenCoins.map((c) => c.toUpperCase()));
  const bestAvailable =
    userSignals.find((s) => !openCoinSet.has(s.coin.toUpperCase())) ?? null;

  const balanceGateOpen = !balanceBlocker || balanceReadFlake;

  if (balanceGateOpen && userSignals.length === 0 && hlOpenCoins.length < maxPositions) {
    pushMarket(
      'market.no_setup',
      describeNoTradeableSetupBlocker(rawUserSignals.length, filterReasons)
    );
  } else if (userSignals.length > 0) {
    pass('market.signals', 'market', `${userSignals.length} tradeable signal(s) after universe filter`);
  }

  if (balanceGateOpen && !bestAvailable && userSignals.length > 0 && hlOpenCoins.length < maxPositions) {
    pushMarket('market.all_open', 'all tradeable pairs already have open positions');
  }

  if (
    balanceGateOpen &&
    !bestAvailable &&
    userSignals.length === 0 &&
    rawUserSignals.length > 0 &&
    hlOpenCoins.length < maxPositions
  ) {
    pushMarket(
      'market.universe_filter',
      `scan found ${rawUserSignals.length} raw signal(s) but 0 passed universe — ${describeOpenUniverseForClient(globalScan).summary}`
    );
  }

  if (balanceGateOpen && bestAvailable && hlOpenCoins.length < maxPositions && dbSettings.autoTradeEnabled) {
    let perSlot = resolveHlMarginPerSlot(
      hlSizingBalance,
      dbSettings.riskLevelBps,
      hlOpenCoins.length,
      hlFreeMargin,
      hlBalanceUsd
    );
    const lev = Math.max(1, Math.floor(dbSettings.leverageMultiplier || 10));
    const minNotional = config.hyperliquid.minNotionalUsd;
    const slotsLeft = maxPositions - hlOpenCoins.length;
    const marginHeadroom = marginHeadroomForSlot(
      hlSizingBalance,
      hlFreeMargin,
      dbSettings.riskLevelBps,
      slotsLeft,
      maxPositions
    );
    const minCollateral = minHlMarginForNotionalFloor(perSlot, lev, minNotional);
    if (hlBalanceUsd >= config.hyperliquid.minAccountUsd && marginHeadroom >= minCollateral) {
      perSlot = capHlEntryCollateralToAvailable(
        Math.min(Math.max(perSlot, minCollateral), marginHeadroom),
        hlFreeMargin,
        slotsLeft
      );
    } else {
      perSlot = capHlEntryCollateralToAvailable(perSlot, hlFreeMargin, slotsLeft);
    }
    if (perSlot < 1) {
      pushUser(
        'user.margin_slot',
        hlOpenCoins.length > 0
          ? `free margin too low for slot 2 ($${hlFreeMargin.toFixed(2)} free)`
          : `margin too small for slot ($${perSlot.toFixed(2)} from $${hlBalanceUsd.toFixed(2)} balance)`
      );
    } else {
      const previewLev = resolveHlOrderLeverage(perSlot, lev, 50, minNotional);
      if (previewLev.notionalUsd < minNotional) {
        pushUser(
          FUNNEL.open.notional,
          buildNotionalBelowFloorError(
            previewLev.notionalUsd,
            minNotional,
            perSlot,
            previewLev.leverage,
            lev
          )
        );
      } else {
        pass(
          'user.margin_ok',
          'user',
          `Margin OK — ~$${previewLev.notionalUsd.toFixed(0)} notional at ${previewLev.leverage}x`
        );
      }
    }
  }

  const lastOpenError = getLastHlOpenErrorForClient(walletAddress);
  if (lastOpenError?.error) {
    gates.push(gate('open.last_error', 'open', lastOpenError.error, true));
  }

  const recentFunnel = await fetchRecentFunnelForWallet(walletAddress, 12);
  for (const row of recentFunnel.filter((r) => !r.passed && r.skip_reason)) {
    gates.push(
      gate(row.skip_reason!, 'funnel', `${row.stage} · ${row.coin} ${row.direction}`, true)
    );
  }

  const userReady = userBlockers.length === 0;
  const marketReady = Boolean(bestAvailable) || hlOpenCoins.length > 0;
  const canTrade = userReady && marketReady;

  const runnable =
    dbSettings.autoTradeEnabled && hlAgentOk && !feeSummary.opensBlocked;

  const wouldProcessOpens =
    runnable &&
    tradePerm.allowed &&
    !banStatus.isBanned &&
    winRateGate.allowed &&
    hlOpenCoins.length < maxPositions &&
    (balanceGateOpen || balanceReadFlake);

  const blockingGates = gates.filter((g) => g.blocking);
  const summary = canTrade
    ? `Ready — next: ${bestAvailable?.coin ?? 'monitor'} ${bestAvailable?.direction ?? ''}`
    : blockingGates.length > 0
      ? blockingGates
          .slice(0, 3)
          .map((g) => g.id)
          .join(' · ')
      : marketBlockers[0] ?? userBlockers[0] ?? 'blocked';

  return {
    wallet: walletAddress,
    canTrade,
    userReady,
    marketReady,
    runnable,
    wouldProcessOpens,
    summary,
    userBlockers,
    marketBlockers,
    blockers: [...userBlockers, ...marketBlockers],
    gates,
    hyperliquid: {
      agentApproved: hlAgentOk,
      accountEquityUsd: hlBalanceUsd,
      sizingBalanceUsd: hlSizingBalance,
      perpUsd: hlFunding.perpUsd,
      spotUsdcUsd: hlFunding.spotUsdcUsd,
      tradablePerpUsd: hlFunding.tradablePerpUsd,
      withdrawableUsd: hlFunding.withdrawableUsd,
      unifiedAccount: hlFunding.unifiedAccount,
      freeMarginUsd: hlFreeMargin,
      openCoins: hlOpenCoins,
      maxConcurrentPositions: maxPositions,
      minAccountUsd: config.hyperliquid.minAccountUsd,
      minNotionalUsd: config.hyperliquid.minNotionalUsd,
    },
    globalScan: {
      rawCandidateCount: rawUserSignals.length,
      tradeableCount: userSignals.length,
      filterReasons,
      best: bestAvailable
        ? {
            coin: bestAvailable.coin,
            direction: bestAvailable.direction,
            confidence: bestAvailable.confidence,
          }
        : null,
    },
    recentFunnel,
    lastOpenError,
  };
}

export async function diagnoseWalletTradingBatch(
  wallets: `0x${string}`[]
): Promise<Record<string, WalletTradeDiagnosis>> {
  const globalScan = getCachedGlobalScanForApi();

  const unique = [...new Set(wallets.map((w) => w.toLowerCase() as `0x${string}`))];
  const entries = await Promise.all(
    unique.map(async (w) => [w, await diagnoseWalletTrading(w, { globalScan })] as const)
  );
  return Object.fromEntries(entries);
}
