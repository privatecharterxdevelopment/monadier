import { reconnect } from '@wagmi/core';
import { config, wagmiAdapter } from './wallet';
import { readWalletSession } from './walletSession';

let reconnectInFlight: Promise<void> | null = null;

/** Restore wagmi + AppKit link after reload (injected + WalletConnect). */
export async function runWalletReconnect(): Promise<void> {
  if (reconnectInFlight) return reconnectInFlight;

  reconnectInFlight = (async () => {
    try {
      await wagmiAdapter.syncConnections();
    } catch {
      /* AppKit storage may not be ready yet */
    }

    const session = readWalletSession();
    if (session?.connectorId) {
      const preferred = config.connectors.find((c) => c.id === session.connectorId);
      if (preferred) {
        try {
          await reconnect(config, { connectors: [preferred] });
          return;
        } catch {
          /* try full reconnect below */
        }
      }
    }

    try {
      await reconnect(config);
    } catch {
      /* wallet extension not available */
    }
  })().finally(() => {
    reconnectInFlight = null;
  });

  return reconnectInFlight;
}
