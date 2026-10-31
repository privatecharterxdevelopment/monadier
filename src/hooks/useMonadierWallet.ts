import { useEffect, useMemo, useState } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import { useAuth } from '../contexts/AuthContext';
import { isMetaMaskInAppBrowser } from '../lib/mobileWalletConnect';
import {
  extendWalletSessionOnActivity,
  readWalletSession,
  touchWalletSession,
} from '../lib/walletSession';

/**
 * Unified wallet connection — AppKit + wagmi + 24h local session.
 * HyperGain login required — no address / history / balances without auth.
 * Reconnect is handled by WalletSessionBridge (silent reconnect only).
 */
export function useMonadierWallet() {
  const { isAuthenticated, sessionReady } = useAuth();
  const appKit = useAppKitAccount();
  const wagmi = useAccount();
  const [sessionTick, setSessionTick] = useState(0);

  const liveConnected = wagmi.isConnected || appKit.isConnected;
  const liveAddress = wagmi.address ?? appKit.address ?? undefined;
  const authOk = sessionReady && isAuthenticated;

  useEffect(() => {
    if (!authOk || !liveConnected || !liveAddress) return;
    touchWalletSession(liveAddress);
    setSessionTick((n) => n + 1);
  }, [authOk, liveConnected, liveAddress]);

  useEffect(() => {
    const bump = () => {
      if (!authOk) return;
      if (readWalletSession()) {
        extendWalletSessionOnActivity();
        setSessionTick((n) => n + 1);
      }
    };
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', bump);
    return () => {
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', bump);
    };
  }, [authOk]);

  return useMemo(() => {
    // Not logged in → treat as fully disconnected (no HL history / balances leak).
    if (!authOk) {
      return {
        address: undefined,
        isConnected: false,
        isRestoring: false,
        isLiveConnected: false,
        status: 'disconnected' as const,
      };
    }

    const session = readWalletSession();
    const sessionActive = session != null;
    const inMetaMaskBrowser = isMetaMaskInAppBrowser();

    const restoring = !inMetaMaskBrowser && sessionActive && !liveConnected;

    const sessionAddress =
      sessionActive && session?.address
        ? (session.address as `0x${string}`)
        : undefined;

    const address = liveAddress ?? sessionAddress;

    const addressesMatch =
      !liveAddress ||
      !sessionAddress ||
      liveAddress.toLowerCase() === sessionAddress.toLowerCase();

    const isConnected =
      liveConnected || (sessionActive && Boolean(address) && addressesMatch);

    return {
      address,
      isConnected,
      isRestoring: restoring,
      isLiveConnected: liveConnected,
      status: liveConnected
        ? ('connected' as const)
        : restoring
          ? ('reconnecting' as const)
          : ('disconnected' as const),
    };
  }, [
    authOk,
    appKit.isConnected,
    liveAddress,
    liveConnected,
    sessionTick,
    wagmi.isConnected,
    wagmi.isReconnecting,
    wagmi.status,
  ]);
}
