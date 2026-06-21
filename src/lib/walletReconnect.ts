import { connect, getConnections, reconnect } from '@wagmi/core';
import { config, wagmiAdapter } from './wallet';
import { isDesktopBrowser } from './mobileWalletConnect';
import { readWalletSession, touchWalletSession } from './walletSession';

let reconnectInFlight: Promise<boolean> | null = null;

async function tryReconnect(connectors?: (typeof config.connectors)[number][]): Promise<boolean> {
  const result = await reconnect(
    config,
    connectors?.length ? { connectors: [...connectors] } : undefined
  );
  return result.length > 0;
}

async function tryConnectAuthorized(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const session = readWalletSession();
  const sorted = [...config.connectors];

  if (session?.connectorId) {
    const preferred = sorted.find((c) => c.id === session.connectorId);
    if (preferred) {
      sorted.splice(sorted.indexOf(preferred), 1);
      sorted.unshift(preferred);
    }
  }

  for (const connector of sorted) {
    try {
      const authorized = await connector.isAuthorized();
      if (!authorized) continue;
      await connect(config, { connector });
      const live = getConnections(config);
      if (live.length === 0) continue;
      const address = live[0]?.accounts[0];
      if (address) touchWalletSession(address, connector.id);
      return true;
    } catch {
      /* try next connector */
    }
  }

  return false;
}

/** Restore wagmi + AppKit link after reload (injected + WalletConnect). */
export async function runWalletReconnect(): Promise<boolean> {
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
      if (preferred && (await tryReconnect([preferred]))) return true;
    }

    if (await tryReconnect()) return true;

    if (isDesktopBrowser() || session) {
      if (await tryConnectAuthorized()) return true;
    }

    return getConnections(config).length > 0;
  })().finally(() => {
    reconnectInFlight = null;
  });

  return reconnectInFlight;
}
