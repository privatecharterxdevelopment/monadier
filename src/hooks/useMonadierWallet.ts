import { useEffect, useMemo, useRef } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAccount, useReconnect } from 'wagmi';
import {
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
    }
  }, [liveConnected, liveAddress]);

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
    wagmi.isConnected,
    wagmi.isReconnecting,
    wagmi.status,
  ]);
}
