import { useEffect, useMemo, useState } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import { DEMO_WALLET_ADDRESS, useAuth } from '../contexts/AuthContext';
import { isMetaMaskInAppBrowser } from '../lib/mobileWalletConnect';
import { fetchPreferredTradingWallet, fetchUserWalletAddresses } from '../lib/userWallets';
import { resolveHlTradingWallet } from '../lib/hlTradingWallet';
import {
  extendWalletSessionOnActivity,
  readWalletSession,
  rememberUiWallet,
  touchWalletSession,
  writeWalletSession,
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
  const [preferredWallet, setPreferredWallet] = useState<string | undefined>();
  const [linkedReady, setLinkedReady] = useState(false);
  const [restoreUntil, setRestoreUntil] = useState(0);

  const liveConnected = wagmi.isConnected || appKit.isConnected;
  const liveAddress = wagmi.address ?? appKit.address ?? undefined;
  const authOk = sessionReady && isAuthenticated;

  useEffect(() => {
    if (!authOk || isDemoUser) {
      setLinkedWallets(isDemoUser ? [DEMO_WALLET_ADDRESS] : []);
      setPreferredWallet(isDemoUser ? DEMO_WALLET_ADDRESS : undefined);
      setLinkedReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const list = await fetchUserWalletAddresses(undefined, false, user?.id);
      if (cancelled) return;
      setLinkedWallets(list);
      const preferred = await fetchPreferredTradingWallet(list, liveAddress);
      if (cancelled) return;
      setPreferredWallet(preferred);
      setLinkedReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authOk, isDemoUser, liveAddress, user?.id]);

  const tradingAddress = resolveHlTradingWallet({
    connectedAddress: liveAddress,
    linkedWallets,
    preferredWallet,
  });

  useEffect(() => {
    if (!authOk || !linkedReady || !tradingAddress) return;
    const live = liveAddress?.toLowerCase();
    const trading = tradingAddress.toLowerCase();
    // Never let a stray Chrome MetaMask overwrite the account trading wallet.
    if (live && live !== trading && linkedWallets.length > 0) return;
    if (liveConnected && live) {
      touchWalletSession(live);
    } else {
      writeWalletSession(trading);
    }
    setSessionTick((n) => n + 1);
  }, [authOk, linkedReady, liveConnected, liveAddress, linkedWallets, tradingAddress]);

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
    rememberUiWallet(tradingAddress);
  }, [authOk, tradingAddress]);

  useEffect(() => {
    if (!authOk || liveConnected) {
      setRestoreUntil(0);
      return;
    }
    if (!readWalletSession() && linkedWallets.length === 0) return;
    setRestoreUntil(Date.now() + RESTORE_LABEL_MS);
    const t = window.setTimeout(() => setSessionTick((n) => n + 1), RESTORE_LABEL_MS + 50);
    return () => window.clearTimeout(t);
  }, [authOk, liveConnected, linkedWallets.length]);

  return useMemo(() => {
    if (!authOk) {
      return {
        address: undefined,
        liveAddress: undefined as `0x${string}` | undefined,
        isConnected: false,
        isRestoring: false,
        isLiveConnected: false,
        signerMismatch: false,
        status: 'disconnected' as const,
      };
    }

    const inMetaMaskBrowser = isMetaMaskInAppBrowser();
    const address = linkedReady
      ? ((tradingAddress ?? (isDemoUser ? DEMO_WALLET_ADDRESS : undefined)) as
          | `0x${string}`
          | undefined)
      : undefined;

    const isConnected = Boolean(address) || isDemoUser;
    const signerMismatch = Boolean(
      liveConnected &&
        liveAddress &&
        address &&
        liveAddress.toLowerCase() !== address.toLowerCase()
    );

    const restoring =
      (!linkedReady && !inMetaMaskBrowser) ||
      (!inMetaMaskBrowser &&
        !liveConnected &&
        !address &&
        restoreUntil > Date.now());

    return {
      address,
      liveAddress: liveAddress as `0x${string}` | undefined,
      isConnected,
      isRestoring: restoring,
      isLiveConnected: liveConnected,
      signerMismatch,
      status: restoring
        ? ('reconnecting' as const)
        : isConnected
          ? ('connected' as const)
          : ('disconnected' as const),
    };
  }, [
    authOk,
    appKit.isConnected,
    isDemoUser,
    linkedReady,
    liveAddress,
    liveConnected,
    restoreUntil,
    sessionTick,
    tradingAddress,
    wagmi.isConnected,
    wagmi.isReconnecting,
    wagmi.status,
  ]);
}
