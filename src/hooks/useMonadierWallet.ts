import { useEffect, useMemo, useState } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import { isMetaMaskInAppBrowser } from '../lib/mobileWalletConnect';
import {
  extendWalletSessionOnActivity,
  readWalletSession,
  touchWalletSession,
} from '../lib/walletSession';

/**
 * Unified wallet connection — AppKit + wagmi + 30-day local session.
 * Reconnect is handled by WalletSessionBridge (single place — avoids MetaMask conflicts).
 */
export function useMonadierWallet() {
  const appKit = useAppKitAccount();
  const wagmi = useAccount();
  const [sessionTick, setSessionTick] = useState(0);

  const liveConnected = wagmi.isConnected || appKit.isConnected;
  const liveAddress = wagmi.address ?? appKit.address ?? undefined;

  useEffect(() => {
    if (!liveConnected || !liveAddress) return;
    touchWalletSession(liveAddress);
    setSessionTick((n) => n + 1);
  }, [liveConnected, liveAddress]);

  useEffect(() => {
    const bump = () => {
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
  }, []);

  return useMemo(() => {
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
    appKit.isConnected,
    liveAddress,
    liveConnected,
    sessionTick,
    wagmi.isConnected,
    wagmi.isReconnecting,
    wagmi.status,
  ]);
}
