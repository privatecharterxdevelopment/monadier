import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useWeb3 } from '../contexts/Web3Context';
import { useAuth } from '../contexts/AuthContext';
import { linkWalletToUserSafe } from '../lib/userWallets';
import { VAULT_CHAIN_ID } from '../lib/vault';
import {
  reconcileUserPositions,
  tryReconcileOrphanedVaultOnChain,
} from '../lib/positionReconciliation';

const INTERVAL_MS = 90_000;
const MIN_GAP_MS = 45_000;

/**
 * Keeps Supabase positions aligned with vault on-chain state for the connected user.
 * Runs on mount and periodically while dashboard2 is open.
 */
export function usePositionReconciliation(onSynced?: () => void) {
  const { address, isConnected } = useAccount();
  const { publicClient, walletClient, chainId } = useWeb3();
  const { user, isDemoUser } = useAuth();
  const lastRunRef = useRef(0);
  const [syncedTotal, setSyncedTotal] = useState(0);

  const run = useCallback(async () => {
    const now = Date.now();
    if (now - lastRunRef.current < MIN_GAP_MS) return;
    if (!isConnected || isDemoUser || chainId !== VAULT_CHAIN_ID || !publicClient) {
      return;
    }

    lastRunRef.current = now;

    try {
      if (user?.id && address) {
        const link = await linkWalletToUserSafe(user.id, address);
        if (!link.ok && link.code === 'owned_by_other') {
          console.warn('[usePositionReconciliation] wallet owned by another user');
          return;
        }
      }

      const synced = await reconcileUserPositions(address, publicClient, isDemoUser);
      if (synced > 0) {
        setSyncedTotal((n) => n + synced);
        onSynced?.();
      }

      if (walletClient && address) {
        const didChain = await tryReconcileOrphanedVaultOnChain(
          address as `0x${string}`,
          publicClient,
          walletClient
        );
        if (didChain) onSynced?.();
      }
    } catch (e) {
      console.error('[usePositionReconciliation]', e);
    }
  }, [
    address,
    chainId,
    isConnected,
    isDemoUser,
    onSynced,
    publicClient,
    walletClient,
  ]);

  useEffect(() => {
    run();
    const id = setInterval(run, INTERVAL_MS);
    return () => clearInterval(id);
  }, [run]);

  return { syncedTotal, reconcileNow: run };
}
