import { getConnections, reconnect } from '@wagmi/core';
import { config, wagmiAdapter } from './wallet';
import { readWalletSession } from './walletSession';

let reconnectInFlight: Promise<boolean> | null = null;
let lastSilentAttemptAt = 0;

/** Min gap between silent reconnect tries — avoids MetaMask spam. */
const SILENT_RECONNECT_COOLDOWN_MS = 60_000;

function isLiveConnected(): boolean {
  return getConnections(config).length > 0;
}

async function tryReconnect(connectors?: (typeof config.connectors)[number][]): Promise<boolean> {
  if (isLiveConnected()) return true;
  const result = await reconnect(
    config,
    connectors?.length ? { connectors: [...connectors] } : undefined
  );
  return result.length > 0 || isLiveConnected();
}

type ReconnectOpts = {
  /** Bypass cooldown (initial page load only). */
  force?: boolean;
};

/**
 * Restore wagmi after reload — reconnect() only (no connect()).
 * connect() opens MetaMask; must run only when the user clicks Connect.
 */
export async function runWalletReconnect(opts?: ReconnectOpts): Promise<boolean> {
  if (isLiveConnected()) return true;
  if (reconnectInFlight) return reconnectInFlight;

  const now = Date.now();
  if (!opts?.force && now - lastSilentAttemptAt < SILENT_RECONNECT_COOLDOWN_MS) {
    return false;
  }
  lastSilentAttemptAt = now;

  reconnectInFlight = (async () => {
    try {
      await wagmiAdapter.syncConnections();
    } catch {
      /* AppKit storage may not be ready yet */
    }

    if (isLiveConnected()) return true;

    const session = readWalletSession();
    if (session?.connectorId) {
      const preferred = config.connectors.find((c) => c.id === session.connectorId);
      if (preferred && (await tryReconnect([preferred]))) return true;
    }

    return tryReconnect();
  })().finally(() => {
    reconnectInFlight = null;
  });

  return reconnectInFlight;
}

/** User clicked Connect — allow wagmi connect via AppKit modal (not used here). */
export function markWalletConnectAttempt(): void {
  lastSilentAttemptAt = Date.now();
}
