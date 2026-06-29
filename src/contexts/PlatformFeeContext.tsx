import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import PlatformFeePayModal from '../components/protrade/PlatformFeePayModal';
import { useTermAuthToast } from '../components/terminal/TermAuthToast';
import { usePlatformFees } from '../hooks/usePlatformFees';

type PlatformFeeCtx = {
  accruedUsd: number;
  opensBlocked: boolean;
  withdrawBlocked: boolean;
  successWinCount: number;
  winsUntilBlock: number;
  winsBeforeBlock: number;
  refresh: () => void;
  openPayModal: () => void;
};

const Ctx = createContext<PlatformFeeCtx | null>(null);

export function usePlatformFeeGate(): PlatformFeeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      accruedUsd: 0,
      opensBlocked: false,
      withdrawBlocked: false,
      successWinCount: 0,
      winsUntilBlock: 20,
      winsBeforeBlock: 20,
      refresh: () => undefined,
      openPayModal: () => undefined,
    };
  }
  return ctx;
}

export const PlatformFeeProvider: React.FC<{
  wallet?: string | null;
  enabled?: boolean;
  children: React.ReactNode;
}> = ({ wallet, enabled = true, children }) => {
  const fees = usePlatformFees(wallet, enabled && Boolean(wallet));
  const { showToast } = useTermAuthToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [autoPrompted, setAutoPrompted] = useState(false);
  const refreshFees = fees.refresh;

  const openPayModal = useCallback(() => setModalOpen(true), []);

  const handlePaymentSuccess = useCallback(() => {
    showToast('Account ready to trade', 3200);
    void refreshFees();
  }, [showToast, refreshFees]);

  useEffect(() => {
    if (fees.opensBlocked && fees.accruedUsd > 0 && !autoPrompted) {
      setModalOpen(true);
      setAutoPrompted(true);
    }
    if (!fees.opensBlocked && fees.accruedUsd <= 0) {
      setAutoPrompted(false);
    }
  }, [fees.opensBlocked, fees.accruedUsd, autoPrompted]);

  const value = useMemo<PlatformFeeCtx>(
    () => ({
      accruedUsd: fees.accruedUsd,
      opensBlocked: fees.opensBlocked,
      withdrawBlocked: fees.withdrawBlocked,
      successWinCount: fees.successWinCount,
      winsUntilBlock: fees.winsUntilBlock,
      winsBeforeBlock: fees.winsBeforeBlock,
      refresh: fees.refresh,
      openPayModal,
    }),
    [fees, openPayModal]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <PlatformFeePayModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        accruedUsd={fees.accruedUsd}
        successWinCount={fees.successWinCount}
        winsBeforeBlock={fees.winsBeforeBlock}
        opensBlocked={fees.opensBlocked}
        builderAddress={fees.builderAddress}
        trades={fees.trades}
        onPaid={fees.confirmPayment}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </Ctx.Provider>
  );
};
