import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import PlatformFeePayModal from '../components/protrade/PlatformFeePayModal';
import { useTermAuthToast } from '../components/terminal/TermAuthToast';
import { useAuth } from './AuthContext';
import { isFeeExemptUser } from '../lib/admin';
import { usePlatformFees } from '../hooks/usePlatformFees';

type PlatformFeeCtx = {
  accruedUsd: number;
  opensBlocked: boolean;
  withdrawBlocked: boolean;
  successWinCount: number;
  winsUntilBlock: number;
  winsBeforeBlock: number;
  feesWaived: boolean;
  botTradingBlocked: boolean;
  feesDue: boolean;
  canPayEarly: boolean;
  refresh: () => void;
  openPayModal: () => void;
};

const EXEMPT_CTX: PlatformFeeCtx = {
  accruedUsd: 0,
  opensBlocked: false,
  withdrawBlocked: false,
  successWinCount: 0,
  winsUntilBlock: 20,
  winsBeforeBlock: 20,
  feesWaived: true,
  botTradingBlocked: false,
  feesDue: false,
  canPayEarly: false,
  refresh: () => undefined,
  openPayModal: () => undefined,
};

const Ctx = createContext<PlatformFeeCtx | null>(null);

export function usePlatformFeeGate(): PlatformFeeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) return { ...EXEMPT_CTX, feesWaived: false };
  return ctx;
}

export const PlatformFeeProvider: React.FC<{
  wallet?: string | null;
  enabled?: boolean;
  children: React.ReactNode;
}> = ({ wallet, enabled = true, children }) => {
  const { user } = useAuth();
  const feeExempt = isFeeExemptUser(user?.email, wallet);
  const fees = usePlatformFees(wallet, enabled && Boolean(wallet) && !feeExempt);
  const { showToast } = useTermAuthToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [autoPrompted, setAutoPrompted] = useState(false);
  const refreshFees = fees.refresh;

  const feesWaived = feeExempt || fees.feesWaived;
  const accruedUsd = feeExempt ? 0 : fees.accruedUsd;
  const opensBlocked = feeExempt ? false : fees.opensBlocked;
  const withdrawBlocked = feeExempt ? false : fees.withdrawBlocked;
  const successWinCount = feeExempt ? 0 : fees.successWinCount;
  const botTradingBlocked = opensBlocked && !feesWaived;
  const feesDue = botTradingBlocked;
  const canPayEarly =
    !feesWaived && accruedUsd > 0.000_001 && !botTradingBlocked;

  const openPayModal = useCallback(() => {
    if (feeExempt) return;
    setModalOpen(true);
  }, [feeExempt]);

  const handlePaymentSuccess = useCallback(() => {
    showToast('Fees paid — win counter reset to 0/20', 3200);
    void refreshFees();
  }, [showToast, refreshFees]);

  useEffect(() => {
    if (feeExempt) {
      setModalOpen(false);
      setAutoPrompted(false);
      return;
    }
    if (botTradingBlocked && accruedUsd > 0 && !autoPrompted) {
      setModalOpen(true);
      setAutoPrompted(true);
    }
    if (!botTradingBlocked && accruedUsd <= 0) {
      setAutoPrompted(false);
    }
  }, [feeExempt, botTradingBlocked, accruedUsd, autoPrompted]);

  const value = useMemo<PlatformFeeCtx>(
    () => ({
      accruedUsd,
      opensBlocked,
      withdrawBlocked,
      successWinCount,
      winsUntilBlock: fees.winsUntilBlock,
      winsBeforeBlock: fees.winsBeforeBlock,
      feesWaived,
      botTradingBlocked,
      feesDue,
      canPayEarly,
      refresh: fees.refresh,
      openPayModal,
    }),
    [
      accruedUsd,
      opensBlocked,
      withdrawBlocked,
      successWinCount,
      fees,
      feesWaived,
      botTradingBlocked,
      feesDue,
      canPayEarly,
      openPayModal,
    ]
  );

  if (feeExempt) {
    return <Ctx.Provider value={EXEMPT_CTX}>{children}</Ctx.Provider>;
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <PlatformFeePayModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        payerWallet={wallet}
        accruedUsd={fees.accruedUsd}
        successWinCount={fees.successWinCount}
        winsBeforeBlock={fees.winsBeforeBlock}
        opensBlocked={fees.opensBlocked}
        treasuryAddress={fees.treasuryAddress}
        trades={fees.trades}
        onPaid={fees.confirmPayment}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </Ctx.Provider>
  );
};
