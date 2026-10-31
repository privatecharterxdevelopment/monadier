import type { VaultSettingsSnapshot } from './vaultSettingsSnapshot';
import type { HlBotStrategy } from './hlBotStrategy';
import {
  persistVaultSettings,
  type PersistVaultSettingsOptions,
} from './syncVaultSettings';

/** Switch Standard ↔ Aggressive while bot runs — no stop/restart. */
export async function saveHlBotStrategyMode(
  wallet: string,
  snapshot: VaultSettingsSnapshot,
  next: HlBotStrategy,
  opts: Pick<
    PersistVaultSettingsOptions,
    'planTier' | 'publicClient' | 'walletClient' | 'userAddress' | 'isDemoUser'
  >
) {
  if (next === snapshot.hlBotStrategy) {
    return { settings: snapshot };
  }

  return persistVaultSettings({
    settings: {
      walletAddress: wallet.toLowerCase(),
      autoTradeEnabled: snapshot.autoTradeEnabled,
      riskPct: snapshot.riskPct,
      leverage: snapshot.leverage,
      takeProfit: snapshot.takeProfit,
      stopLoss: snapshot.stopLoss,
      askPermission: snapshot.askPermission,
      minWinRate: snapshot.minWinRate,
      minTradesForWinRate: snapshot.minTradesForWinRate,
      hlBotStrategy: next,
      maxConcurrentPositions: snapshot.maxConcurrentPositions,
    },
    planTier: opts.planTier,
    publicClient: opts.publicClient,
    walletClient: opts.walletClient,
    userAddress: opts.userAddress,
    isDemoUser: opts.isDemoUser,
    syncTradingParams: false,
    syncAutoTrade: false,
  });
}
