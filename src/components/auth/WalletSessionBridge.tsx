import { useEffect, useRef } from 'react';
import { getConnections } from '@wagmi/core';
import { useAccount, useConnectionEffect } from 'wagmi';
import { useAppKitAccount } from '@reown/appkit/react';
import { config } from '../../lib/wallet';
import {
  isDesktopBrowser,
  isMetaMaskInAppBrowser,
} from '../../lib/mobileWalletConnect';
import { runWalletReconnect } from '../../lib/walletReconnect';
import {
  extendWalletSessionOnActivity,
  readWalletSession,
  touchWalletSession,
} from '../../lib/walletSession';

const DESKTOP_RECONNECT_INTERVAL_MS = 2_000;
const MOBILE_RECONNECT_INTERVAL_MS = 4_000;

function persistSession(address: string, connectorId?: string) {
  let cid = connectorId;
  if (!cid) {
    const match = getConnections(config).find((c) =>
      c.accounts.some((a) => a.toLowerCase() === address.toLowerCase())
    );
    cid = match?.connector.id;
  }
  touchWalletSession(address, cid);
}

/** Keeps wagmi + AppKit in sync and maintains wallet session across reloads. */
const WalletSessionBridge: React.FC = () => {
  const { address: wagmiAddress, isConnected: wagmiConnected, status: wagmiStatus } = useAccount();
  const { address: appKitAddress, isConnected: appKitConnected } = useAppKitAccount();

  const wagmiConnectedRef = useRef(wagmiConnected);
  const appKitConnectedRef = useRef(appKitConnected);
  const wagmiStatusRef = useRef(wagmiStatus);

  wagmiConnectedRef.current = wagmiConnected;
  appKitConnectedRef.current = appKitConnected;
  wagmiStatusRef.current = wagmiStatus;

  useEffect(() => {
    void runWalletReconnect();
    const t = window.setTimeout(() => void runWalletReconnect(), 400);
    const t2 = window.setTimeout(() => void runWalletReconnect(), 1200);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, []);

  useConnectionEffect({
    onConnect({ address, connector }) {
      if (address) persistSession(address, connector?.id);
    },
  });

  useEffect(() => {
    const address = wagmiAddress ?? appKitAddress;
    if ((wagmiConnected || appKitConnected) && address) {
      persistSession(address);
    }
  }, [wagmiAddress, appKitAddress, wagmiConnected, appKitConnected]);

  useEffect(() => {
    if (wagmiConnected || appKitConnected) return undefined;
    const session = readWalletSession();
    if (!session) return undefined;
    if (isMetaMaskInAppBrowser() && wagmiStatus === 'connected') return undefined;

    const intervalMs = isDesktopBrowser()
      ? DESKTOP_RECONNECT_INTERVAL_MS
      : MOBILE_RECONNECT_INTERVAL_MS;

    void runWalletReconnect();

    const id = window.setInterval(() => {
      if (wagmiConnectedRef.current || appKitConnectedRef.current) {
        window.clearInterval(id);
        return;
      }
      if (!readWalletSession()) {
        window.clearInterval(id);
        return;
      }
      void runWalletReconnect();
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [wagmiConnected, appKitConnected, wagmiStatus]);

  useEffect(() => {
    const onActivity = () => {
      if (document.visibilityState === 'hidden') return;
      const session = readWalletSession();
      if (!session) return;
      extendWalletSessionOnActivity();
      if (
        !wagmiConnectedRef.current &&
        !appKitConnectedRef.current &&
        !isMetaMaskInAppBrowser()
      ) {
        void runWalletReconnect();
      }
    };

    document.addEventListener('visibilitychange', onActivity);
    window.addEventListener('pageshow', onActivity);
    window.addEventListener('focus', onActivity);
    return () => {
      document.removeEventListener('visibilitychange', onActivity);
      window.removeEventListener('pageshow', onActivity);
      window.removeEventListener('focus', onActivity);
    };
  }, []);

  return null;
};

export default WalletSessionBridge;
