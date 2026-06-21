import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAccount, useReconnect } from 'wagmi';
import {
  extendWalletSessionOnActivity,
  readWalletSession,
  touchWalletSession,
} from '../lib/walletSession';

/**
 * Unified wallet connection — wagmi reconnect + AppKit + 4h local session.
 * Use instead of useAppKitAccount when UI must stay connected after reload.
 */
export function useMonadierWallet() {
  const appKit = useAppKitAccount();
  const wagmi = useAccount();
  const { reconnect, isPending: reconnectPending } = useReconnect();
  const reconnectAttempted = useRef(false);
  const [sessionTick, setSessionTick] = useState(0);

  useEffect(() => {
    if (reconnectAttempted.current) return;
    reconnectAttempted.current = true;
    void reconnect();
  }, [reconnect]);

  const liveConnected = wagmi.isConnected || appKit.isConnected;
  const liveAddress = wagmi.address ?? appKit.address ?? undefined;

  useEffect(() => {
    if (liveConnected && liveAddress) {
      touchWalletSession(liveAddress);
      setSessionTick((n) => n + 1);
    }
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
    const restoring =
      sessionActive &&
      !liveConnected &&
      (wagmi.isReconnecting || reconnectPending || wagmi.status === 'connecting');

    const address =
      liveAddress ?? (sessionActive ? (session.address as `0x${string}`) : undefined);

    const isConnected = liveConnected || (sessionActive && Boolean(address));

    return {
      address,
      isConnected,
      /** True while reload reconnect is in flight (session still valid). */
      isRestoring: restoring,
      /** Wagmi/AppKit live link — required for signing transactions. */
      isLiveConnected: liveConnected,
      status: liveConnected
        ? ('connected' as const)
        : restoring
          ? ('reconnecting' as const)
          : isConnected
            ? ('connected' as const)
            : ('disconnected' as const),
    };
  }, [
    appKit.isConnected,
    liveAddress,
    liveConnected,
    reconnectPending,
    sessionTick,
    wagmi.isConnected,
    wagmi.isReconnecting,
    wagmi.status,
  ]);
}
