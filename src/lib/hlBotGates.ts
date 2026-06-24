import { MIN_HL_BOT_USD } from './hyperliquid/hlBotAgent';

/** User has funded HL, approved agent, and platform builder fee when HL builder is active. */
export function isHlBotReadyToRun(
  hlBalanceUsd: number,
  agentApproved: boolean,
  builderFeeApproved = true,
  builderPlatformReady = true
): boolean {
  const builderOk = !builderPlatformReady || builderFeeApproved;
  return hlBalanceUsd >= MIN_HL_BOT_USD && agentApproved && builderOk;
}

/** DB auto_trade flag — bot stays enabled across reloads until user presses Stop. */
export function isHlBotEnabled(autoTradeEnabled: boolean): boolean {
  return autoTradeEnabled;
}

/** Resolve bot on/off — optimistic stop/start wins; never keep running on stale metrics. */
export function resolveHlBotRunning(opts: {
  settingsAutoTrade: boolean;
  settingsLoading?: boolean;
  metricsAutoTrade?: boolean;
  metricsHasSnapshot?: boolean;
  lastKnownAutoTrade?: boolean | null;
  optimistic?: boolean | null;
}): boolean {
  if (opts.optimistic !== null && opts.optimistic !== undefined) {
    return opts.optimistic;
  }
  if (!opts.settingsLoading) {
    return opts.settingsAutoTrade;
  }
  if (opts.metricsHasSnapshot) {
    return Boolean(opts.metricsAutoTrade);
  }
  if (opts.lastKnownAutoTrade !== null && opts.lastKnownAutoTrade !== undefined) {
    return opts.lastKnownAutoTrade;
  }
  return Boolean(opts.metricsAutoTrade);
}

/**
 * True when DB says on AND HL prerequisites are met (can open new trades this cycle).
 * Use isHlBotEnabled for Start/Stop UI — not this alone.
 */
export function effectiveHlBotRunning(
  autoTradeEnabled: boolean,
  hlBalanceUsd: number,
  agentApproved: boolean,
  builderFeeApproved = true,
  builderPlatformReady = true
): boolean {
  return (
    autoTradeEnabled &&
    isHlBotReadyToRun(hlBalanceUsd, agentApproved, builderFeeApproved, builderPlatformReady)
  );
}

/** @deprecated Client must not auto-disable auto_trade — user stops explicitly via Stop bot. */
export function shouldDisableStaleHlBotAutoTrade(
  _hlBalanceUsd: number,
  _agentApproved: boolean,
  _opts: {
    hlLoaded: boolean;
    agentLoaded: boolean;
    builderFeeApproved?: boolean;
    builderPlatformReady?: boolean;
  }
): boolean {
  return false;
}

/** @deprecated Client must not auto-disable auto_trade on reload. */
export async function disableStaleHlBotAutoTrade(_walletAddress: string): Promise<void> {
  /* no-op — server keeps auto_trade_enabled until user presses Stop */
}
