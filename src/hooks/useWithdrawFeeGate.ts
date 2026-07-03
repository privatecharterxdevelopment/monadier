import { useCallback } from 'react';
import { useBettingFeeGate } from '../contexts/BettingFeeContext';
import { usePlatformFeeGate } from '../contexts/PlatformFeeContext';

/** Withdraw blocked until bot platform fees and/or betting fees are paid on-chain. */
export function useWithdrawFeeGate() {
  const platform = usePlatformFeeGate();
  const betting = useBettingFeeGate();

  const platformWithdrawBlocked = platform.withdrawBlocked;
  const bettingWithdrawBlocked = !betting.feesWaived && betting.bettingBlocked;
  const withdrawBlocked = platformWithdrawBlocked || bettingWithdrawBlocked;

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
