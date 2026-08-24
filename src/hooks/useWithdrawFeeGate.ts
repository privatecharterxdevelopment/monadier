import { useCallback } from 'react';
import { useBettingFeeGate } from '../contexts/BettingFeeContext';
import { usePlatformFeeGate } from '../contexts/PlatformFeeContext';

/** HyperGain is halted — withdraw is never blocked by bot/betting fees. */
export function useWithdrawFeeGate() {
  const platform = usePlatformFeeGate();
  const betting = useBettingFeeGate();

  const platformWithdrawBlocked = false;
  const bettingWithdrawBlocked = false;
  const withdrawBlocked = false;

  const openPayModal = useCallback(() => {
    if (platformWithdrawBlocked) {
      platform.openPayModal();
      return;
    }
    if (bettingWithdrawBlocked) {
      betting.openPayModal();
    }
  }, [platform, betting, platformWithdrawBlocked, bettingWithdrawBlocked]);

  return {
    withdrawBlocked,
    platformWithdrawBlocked,
    bettingWithdrawBlocked,
    platformAccruedUsd: platform.accruedUsd,
    bettingAccruedUsd: betting.accruedUsd,
    openPayModal,
    openPlatformPayModal: platform.openPayModal,
    openBettingPayModal: betting.openPayModal,
  };
}
