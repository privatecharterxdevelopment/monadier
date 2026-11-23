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
 * Shared linked-wallet cache. useMonadierWallet runs in ~30 components; each used to
 * fetch linked wallets on its own, so header / agent / status bar flipped from
 * "Connect" → connected at different times. One fetch, one notify, every instance
 * updates in the same render. Last result is kept in sessionStorage so a refresh
 * shows the wallet immediately.
 */
type LinkedSnap = { list: string[]; preferred?: string };
const LINKED_STORE_KEY = 'hg.linkedWallets.v1';
const linkedMem = new Map<string, LinkedSnap>();
const linkedInflight = new Map<string, Promise<void>>();
const linkedSubs = new Set<() => void>();

function linkedKey(userId: string, live?: string): string {
  return `${userId}|${(live ?? '').toLowerCase()}`;
}

function readStoredLinked(userId: string): LinkedSnap | null {
  try {
    const raw = window.sessionStorage.getItem(LINKED_STORE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { userId?: string; list?: string[]; preferred?: string };
    if (j.userId !== userId || !Array.isArray(j.list)) return null;
    return { list: j.list, preferred: j.preferred };
  } catch {
    return null;
  }
}

function writeStoredLinked(userId: string, snap: LinkedSnap): void {
  try {
    window.sessionStorage.setItem(LINKED_STORE_KEY, JSON.stringify({ userId, ...snap }));
  } catch {
    /* storage unavailable — memory cache still shared */
  }
}

function loadLinkedShared(userId: string, live?: string): Promise<void> {
  const key = linkedKey(userId, live);
  const running = linkedInflight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      const list = await fetchUserWalletAddresses(undefined, false, userId);
      const preferred = await fetchPreferredTradingWallet(list, live);
      const snap = { list, preferred };
      linkedMem.set(key, snap);
      writeStoredLinked(userId, snap);
      linkedSubs.forEach((fn) => fn());
    } finally {
      linkedInflight.delete(key);
    }
  })();
  linkedInflight.set(key, p);
  return p;
}

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
  const [linkedTick, setLinkedTick] = useState(0);
  const [restoreUntil, setRestoreUntil] = useState(0);

  const liveConnected = wagmi.isConnected || appKit.isConnected;
  const liveAddress = wagmi.address ?? appKit.address ?? undefined;
  const authOk = sessionReady && isAuthenticated;

  const userId = authOk && !isDemoUser ? user?.id : undefined;

  useEffect(() => {
    const bump = () => setLinkedTick((n) => n + 1);
    linkedSubs.add(bump);
    return () => {
      linkedSubs.delete(bump);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    void loadLinkedShared(userId, liveAddress).catch(() => undefined);
  }, [userId, liveAddress]);

  const linkedSnap = useMemo<LinkedSnap | null>(() => {
    if (!authOk || isDemoUser) {
      return isDemoUser
        ? { list: [DEMO_WALLET_ADDRESS], preferred: DEMO_WALLET_ADDRESS }
        : { list: [] };
    }
    if (!userId) return null;
    // Fresh shared result for this signer, else last known (same user) for instant paint.
    return linkedMem.get(linkedKey(userId, liveAddress)) ?? readStoredLinked(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authOk, isDemoUser, userId, liveAddress, linkedTick]);

  const linkedWallets = linkedSnap?.list ?? [];
  const preferredWallet = linkedSnap?.preferred;
  const linkedReady = linkedSnap != null;

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
