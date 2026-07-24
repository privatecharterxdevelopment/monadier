import { useEffect, useRef } from 'react';
import { getConnections } from '@wagmi/core';
import { useAccount, useChainId, useConnectionEffect, useDisconnect, useSwitchChain } from 'wagmi';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAuth } from '../../contexts/AuthContext';
import { ensureHlWalletChain } from '../../lib/ensureHlWalletChain';
import { HL_ARBITRUM_CHAIN_ID } from '../../lib/hyperliquid/bridge';
import { config } from '../../lib/wallet';
import { runWalletReconnect } from '../../lib/walletReconnect';
import {
  clearWalletSession,
  extendWalletSessionOnActivity,
  isWalletSessionActive,
  readWalletSession,
  touchWalletSession,
} from '../../lib/walletSession';

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

type EthereumProvider = {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

/** Keeps wagmi in sync and maintains wallet session across reloads — silent reconnect only. */
const WalletSessionBridge: React.FC = () => {
  const { isAuthenticated, sessionReady } = useAuth();
  const { disconnect } = useDisconnect();
  const { address: wagmiAddress, isConnected: wagmiConnected, status: wagmiStatus } = useAccount();
  const { address: appKitAddress, isConnected: appKitConnected } = useAppKitAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const wagmiConnectedRef = useRef(wagmiConnected);
  const appKitConnectedRef = useRef(appKitConnected);
  const wagmiStatusRef = useRef(wagmiStatus);
  const authOkRef = useRef(false);
  const mountReconnectDone = useRef(false);

  wagmiConnectedRef.current = wagmiConnected;
  appKitConnectedRef.current = appKitConnected;
  wagmiStatusRef.current = wagmiStatus;
  authOkRef.current = sessionReady && isAuthenticated;

  // No HyperGain login → no wallet. Clear any leftover session from before this rule.
  useEffect(() => {
    if (!sessionReady) return;
    if (isAuthenticated) return;
    clearWalletSession();
    if (wagmiConnected || appKitConnected) {
      disconnect();
    }
  }, [sessionReady, isAuthenticated, wagmiConnected, appKitConnected, disconnect]);

  useEffect(() => {
    if (!sessionReady || !isAuthenticated) return;
    if (mountReconnectDone.current) return;
    mountReconnectDone.current = true;
    void runWalletReconnect({ force: true });
  }, [sessionReady, isAuthenticated]);

  // After login, allow a fresh reconnect pass.
  useEffect(() => {
    if (!sessionReady || !isAuthenticated) {
      mountReconnectDone.current = false;
    }
  }, [sessionReady, isAuthenticated]);

  useConnectionEffect({
    onConnect({ address, connector }) {
      if (!authOkRef.current) {
        clearWalletSession();
        disconnect();
        return;
      }
      if (address) persistSession(address, connector?.id);
      void switchChainAsync?.({ chainId: HL_ARBITRUM_CHAIN_ID }).catch(() => {});
    },
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!wagmiConnected && !appKitConnected) return;
    void ensureHlWalletChain(chainId, switchChainAsync);
  }, [isAuthenticated, wagmiConnected, appKitConnected, chainId, switchChainAsync]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const address = wagmiAddress ?? appKitAddress;
    if ((wagmiConnected || appKitConnected) && address) {
      persistSession(address);
    }
  }, [isAuthenticated, wagmiAddress, appKitAddress, wagmiConnected, appKitConnected]);

  /** After OS/browser restart MetaMask may unlock late — keep trying while session is active. */
  useEffect(() => {
    const tryRestore = () => {
      if (!authOkRef.current) return;
      if (!isWalletSessionActive()) return;
      const status = wagmiStatusRef.current;
      if (
        wagmiConnectedRef.current ||
        appKitConnectedRef.current ||
        status === 'connecting' ||
        status === 'reconnecting'
      ) {
        return;
      }
      if (getConnections(config).length > 0) return;
      void runWalletReconnect();
    };

    const onActivity = () => {
      if (document.visibilityState === 'hidden') return;
      if (!authOkRef.current) return;
      const session = readWalletSession();
      if (!session) return;
      extendWalletSessionOnActivity();
      tryRestore();
    };

    document.addEventListener('visibilitychange', onActivity);
    window.addEventListener('focus', onActivity);

    // Retry for ~2 min after mount (covers MetaMask unlock after computer restart).
    const retryTimers = [2_000, 5_000, 12_000, 25_000, 45_000, 90_000].map((ms) =>
      window.setTimeout(tryRestore, ms)
    );

    const eth = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    const onAccounts = () => tryRestore();
    const onConnect = () => tryRestore();
    eth?.on?.('accountsChanged', onAccounts);
    eth?.on?.('connect', onConnect);

    return () => {
      document.removeEventListener('visibilitychange', onActivity);
      window.removeEventListener('focus', onActivity);
      retryTimers.forEach((id) => window.clearTimeout(id));
      eth?.removeListener?.('accountsChanged', onAccounts);
      eth?.removeListener?.('connect', onConnect);
    };
  }, []);

  return null;
};

export default WalletSessionBridge;
