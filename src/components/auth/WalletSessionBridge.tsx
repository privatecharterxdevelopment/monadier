import { useEffect, useRef } from 'react';
import { useAccount, useConnectionEffect } from 'wagmi';
import { useAppKitAccount } from '@reown/appkit/react';
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

const DESKTOP_RECONNECT_INTERVAL_MS = 3_000;
const DESKTOP_MAX_RECONNECT_ATTEMPTS = 20;
const MOBILE_RECONNECT_INTERVAL_MS = 5_000;
const MOBILE_MAX_RECONNECT_ATTEMPTS = 8;

/** Keeps wagmi + AppKit in sync and maintains the 4h wallet session across reloads. */
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
  }, []);

  useConnectionEffect({
    onConnect({ address, connector }) {
      if (address) touchWalletSession(address, connector?.id);
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

    const isDesktop = isDesktopBrowser();
    const intervalMs = isDesktop
      ? DESKTOP_RECONNECT_INTERVAL_MS
      : MOBILE_RECONNECT_INTERVAL_MS;
    const maxAttempts = isDesktop
      ? DESKTOP_MAX_RECONNECT_ATTEMPTS
      : MOBILE_MAX_RECONNECT_ATTEMPTS;

    void runWalletReconnect();

    let attempts = 0;
    const id = window.setInterval(() => {
      if (wagmiConnectedRef.current || appKitConnectedRef.current) {
        window.clearInterval(id);
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
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
