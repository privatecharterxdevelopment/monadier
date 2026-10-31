import { disconnect as wagmiDisconnect } from '@wagmi/core';
import { config } from './wallet';
import { clearWalletSession } from './walletSession';

/** Explicit user disconnect — clears the 4h session and wagmi/AppKit state. */
export async function disconnectMonadierWallet(): Promise<void> {
  clearWalletSession();
  try {
    await wagmiDisconnect(config);
  } catch {
    /* already disconnected */
  }
}
