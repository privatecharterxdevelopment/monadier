import { useEffect, useRef } from 'react';
import { getConnections } from '@wagmi/core';
import { useAccount, useConnectionEffect, useReconnect } from 'wagmi';
import { useAppKitAccount } from '@reown/appkit/react';
import { config } from '../../lib/wallet';
import { isMetaMaskInAppBrowser } from '../../lib/mobileWalletConnect';
import {
  clearWalletSession,
  extendWalletSessionOnActivity,
  readWalletSession,
  touchWalletSession,
} from '../../lib/walletSession';

const DISCONNECT_GRACE_MS = 8_000;
const RECONNECT_INTERVAL_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 8;

/** Keeps wagmi + AppKit in sync and maintains the 4h wallet session across reloads. */
const WalletSessionBridge: React.FC = () => {
  const { address: wagmiAddress, isConnected: wagmiConnected, status: wagmiStatus } = useAccount();
  const { address: appKitAddress, isConnected: appKitConnected } = useAppKitAccount();
  const { reconnect } = useReconnect();

  const wagmiConnectedRef = useRef(wagmiConnected);
  const appKitConnectedRef = useRef(appKitConnected);
  const wagmiStatusRef = useRef(wagmiStatus);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectBootRef = useRef(false);

  wagmiConnectedRef.current = wagmiConnected;
  appKitConnectedRef.current = appKitConnected;
  wagmiStatusRef.current = wagmiStatus;

  useEffect(() => {
    if (reconnectBootRef.current) return;
    reconnectBootRef.current = true;
    if (!wagmiConnected && !appKitConnected) {
      void reconnect();
    }
  }, [reconnect, wagmiConnected, appKitConnected]);

  useConnectionEffect({
    onConnect({ address }) {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      if (address) touchWalletSession(address);
    },
    onDisconnect() {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = setTimeout(() => {
        disconnectTimerRef.current = null;
        if (wagmiConnectedRef.current || appKitConnectedRef.current) return;
        const status = wagmiStatusRef.current;
        if (status === 'reconnecting' || status === 'connecting') return;
        if (!readWalletSession()) return;
        const connections = getConnections(config);
        if (connections.length === 0) clearWalletSession();
      }, DISCONNECT_GRACE_MS);
    },
  });

  useEffect(() => {
    const address = wagmiAddress ?? appKitAddress;
    if ((wagmiConnected || appKitConnected) && address) {
      touchWalletSession(address);
    }
  }, [wagmiAddress, appKitAddress, wagmiConnected, appKitConnected]);

  useEffect(() => {
    if (wagmiConnected || appKitConnected) return;
    const session = readWalletSession();
    if (!session) return;
    if (isMetaMaskInAppBrowser() && wagmiStatus === 'connected') return;

    let attempts = 0;
    const id = window.setInterval(() => {
      if (wagmiConnectedRef.current || appKitConnectedRef.current) {
        window.clearInterval(id);
        return;
      }
      attempts += 1;
      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        window.clearInterval(id);
        return;
      }
      void reconnect();
    }, RECONNECT_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [wagmiConnected, appKitConnected, wagmiStatus, reconnect]);

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
        void reconnect();
      }
    };

    document.addEventListener('visibilitychange', onActivity);
    window.addEventListener('pageshow', onActivity);
    return () => {
      document.removeEventListener('visibilitychange', onActivity);
      window.removeEventListener('pageshow', onActivity);
    };
  }, [reconnect]);

  useEffect(
    () => () => {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    },
    []
  );

  return null;
};

export default WalletSessionBridge;
