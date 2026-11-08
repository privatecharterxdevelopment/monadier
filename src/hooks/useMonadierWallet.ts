import { useEffect, useMemo, useState } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import { DEMO_WALLET_ADDRESS, useAuth } from '../contexts/AuthContext';
import { isMetaMaskInAppBrowser } from '../lib/mobileWalletConnect';
import { fetchUserWalletAddresses } from '../lib/userWallets';
import {
  extendWalletSessionOnActivity,
  readWalletSession,
  rememberUiWallet,
  touchWalletSession,
} from '../lib/walletSession';

const RESTORE_LABEL_MS = 8_000;

/**
 * Unified wallet connection — AppKit + wagmi + 24h local session + linked DB wallet.
 * HyperGain login required. Live connector is only needed to sign (deposit / approve).
 * Safari can show balances and trades from the wallet already linked to the account.
 */
export function useMonadierWallet() {
  const { isAuthenticated, sessionReady, isDemoUser, user } = useAuth();
  const appKit = useAppKitAccount();
  const wagmi = useAccount();
  const [sessionTick, setSessionTick] = useState(0);
  const [linkedWallets, setLinkedWallets] = useState<string[]>([]);
  const [restoreUntil, setRestoreUntil] = useState(0);

  const liveConnected = wagmi.isConnected || appKit.isConnected;
  const liveAddress = wagmi.address ?? appKit.address ?? undefined;
  const authOk = sessionReady && isAuthenticated;

  useEffect(() => {
    if (!authOk || !liveConnected || !liveAddress) return;
    touchWalletSession(liveAddress);
    setSessionTick((n) => n + 1);
  }, [authOk, liveConnected, liveAddress]);

  useEffect(() => {
    if (!authOk || isDemoUser) {
      setLinkedWallets(isDemoUser ? [DEMO_WALLET_ADDRESS] : []);
      return;
    }
    let cancelled = false;
    void fetchUserWalletAddresses(liveAddress, false).then((list) => {
      if (!cancelled) setLinkedWallets(list);
    });
    return () => {
      cancelled = true;
    };
  }, [authOk, isDemoUser, liveAddress, user?.id]);

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

  useEffect(() => {
    if (!authOk) {
      rememberUiWallet(undefined);
      return;
    }
    const session = readWalletSession();
    const addr =
      liveAddress ?? session?.address ?? linkedWallets[0] ?? (isDemoUser ? DEMO_WALLET_ADDRESS : undefined);
    rememberUiWallet(addr);
  }, [authOk, isDemoUser, linkedWallets, liveAddress]);

  useEffect(() => {
    if (!authOk || liveConnected) {
      setRestoreUntil(0);
      return;
    }
    if (!readWalletSession()) return;
    setRestoreUntil(Date.now() + RESTORE_LABEL_MS);
    const t = window.setTimeout(() => setSessionTick((n) => n + 1), RESTORE_LABEL_MS + 50);
    return () => window.clearTimeout(t);
  }, [authOk, liveConnected]);

  return useMemo(() => {
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
    const sessionAddress =
      session?.address ? (session.address as `0x${string}`) : undefined;
    const linkedAddress = linkedWallets[0]
      ? (linkedWallets[0] as `0x${string}`)
      : undefined;
    const inMetaMaskBrowser = isMetaMaskInAppBrowser();

    const address = liveAddress ?? sessionAddress ?? linkedAddress;

    const addressesMatch =
      !liveAddress ||
      !sessionAddress ||
      liveAddress.toLowerCase() === sessionAddress.toLowerCase();

    const isConnected =
      liveConnected ||
      (Boolean(sessionAddress) && addressesMatch) ||
      Boolean(linkedAddress) ||
      isDemoUser;

    const restoring =
      !inMetaMaskBrowser &&
      !liveConnected &&
      Boolean(sessionAddress) &&
      restoreUntil > Date.now();

    return {
      address,
      isConnected,
      isRestoring: restoring,
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
    authOk,
    appKit.isConnected,
    isDemoUser,
    linkedWallets,
    liveAddress,
    liveConnected,
    restoreUntil,
    sessionTick,
    wagmi.isConnected,
    wagmi.isReconnecting,
    wagmi.status,
  ]);
}
