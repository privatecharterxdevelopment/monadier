import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BettingFeePayModal from '../components/protrade/BettingFeePayModal';
import { useTermAuthToast } from '../components/terminal/TermAuthToast';
import { useAuth } from './AuthContext';
import { isFeeExemptUser } from '../lib/admin';
import { useBettingFees } from '../hooks/useBettingFees';
import { BETTING_ACCRUED_FEES_ENABLED } from '../lib/betting/bettingAccruedFees';
import type { BettingFeeStatus } from '../lib/betting/bettingFeesApi';

type BettingFeeCtx = {
  accruedUsd: number;
  successWinCount: number;
  winsBeforeBlock: number;
  bettingBlocked: boolean;
  withdrawBlocked: boolean;
  feesWaived: boolean;
  feesDue: boolean;
  events: ReturnType<typeof useBettingFees>['events'];
  refresh: () => Promise<BettingFeeStatus | void>;
  openPayModal: () => void;
};

const DISABLED_CTX: BettingFeeCtx = {
  accruedUsd: 0,
  successWinCount: 0,
  winsBeforeBlock: 1,
  bettingBlocked: false,
  withdrawBlocked: false,
  feesWaived: true,
  feesDue: false,
  events: [],
  refresh: () => Promise.resolve(undefined),
  openPayModal: () => undefined,
};

const Ctx = createContext<BettingFeeCtx | null>(null);

export function useBettingFeeGate(): BettingFeeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return BETTING_ACCRUED_FEES_ENABLED
      ? { ...DISABLED_CTX, feesWaived: false }
      : DISABLED_CTX;
  }
  return ctx;
}

export const BettingFeeProvider: React.FC<{
  wallet?: string | null;
  enabled?: boolean;
  children: React.ReactNode;
}> = ({ wallet, enabled = true, children }) => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const feeExempt = isFeeExemptUser(user?.email, wallet);
  const fees = useBettingFees(wallet, enabled && Boolean(wallet) && !feeExempt && BETTING_ACCRUED_FEES_ENABLED);
  const { showToast } = useTermAuthToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [autoPrompted, setAutoPrompted] = useState(false);

  const feesWaived = feeExempt || fees.status.feesWaived || !BETTING_ACCRUED_FEES_ENABLED;
  const accruedUsd = feesWaived ? 0 : fees.status.accruedUsd;
  const successWinCount = feesWaived ? 0 : fees.status.successWinCount;
  const winsBeforeBlock = feesWaived ? 1 : fees.status.winsBeforeBlock;
  const bettingBlocked = !feesWaived && fees.status.bettingBlocked;
  const withdrawBlocked = !feesWaived && fees.status.withdrawBlocked;
  const feesDue = !feesWaived && accruedUsd > 0.000_001;

  const openPayModal = useCallback(() => {
    if (feeExempt || !BETTING_ACCRUED_FEES_ENABLED) return;
    setModalOpen(true);
  }, [feeExempt]);

  const handlePaymentSuccess = useCallback(() => {
    showToast('Betting fees paid — withdraw unlocked, you can place your next bet', 3200);
    void fees.refresh();
  }, [showToast, fees.refresh]);

  useEffect(() => {
    if (feeExempt || !BETTING_ACCRUED_FEES_ENABLED) {
      setModalOpen(false);
      setAutoPrompted(false);
      return;
    }
    if (feesDue && bettingBlocked && !autoPrompted) {
      setModalOpen(true);
      setAutoPrompted(true);
    }
    if (!feesDue) {
      setAutoPrompted(false);
    }
  }, [feeExempt, feesDue, bettingBlocked, autoPrompted]);

  useEffect(() => {
    if (feeExempt || fees.loading || !BETTING_ACCRUED_FEES_ENABLED) return;
    if (searchParams.get('payBettingFees') !== '1') return;
    if (accruedUsd <= 0) return;
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('payBettingFees');
    setSearchParams(next, { replace: true });
  }, [feeExempt, fees.loading, searchParams, setSearchParams, accruedUsd]);

  const value = useMemo<BettingFeeCtx>(
    () => ({
      accruedUsd,
      successWinCount,
      winsBeforeBlock,
      bettingBlocked,
      withdrawBlocked,
      feesWaived,
      feesDue,
      events: fees.events,
      refresh: fees.refresh,
      openPayModal,
    }),
    [
      accruedUsd,
      successWinCount,
      winsBeforeBlock,
      bettingBlocked,
      withdrawBlocked,
      feesWaived,
      feesDue,
      fees.events,
      fees.refresh,
      openPayModal,
    ]
  );

  if (!BETTING_ACCRUED_FEES_ENABLED || feeExempt) {
    return <Ctx.Provider value={DISABLED_CTX}>{children}</Ctx.Provider>;
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <BettingFeePayModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        payerWallet={wallet}
        accruedUsd={fees.status.accruedUsd}
        successWinCount={fees.status.successWinCount}
        winsBeforeBlock={fees.status.winsBeforeBlock}
        treasuryAddress={fees.treasuryAddress}
        events={fees.events}
        onPaid={fees.confirmPayment}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </Ctx.Provider>
  );
};
