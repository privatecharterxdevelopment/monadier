import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BettingFeePayModal from '../components/protrade/BettingFeePayModal';
import { useTermAuthToast } from '../components/terminal/TermAuthToast';
import { useAuth } from './AuthContext';
import { isFeeExemptUser } from '../lib/admin';
import { useBettingFees } from '../hooks/useBettingFees';
import { recordBettingFeeEvent, type BettingFeeEventType } from '../lib/betting/bettingFeesApi';
import { BETTING_ACCRUED_FEES_ENABLED } from '../lib/betting/bettingAccruedFees';

type BettingFeeCtx = {
  accruedUsd: number;
  bettingBlocked: boolean;
  feesWaived: boolean;
  feesDue: boolean;
  events: ReturnType<typeof useBettingFees>['events'];
  refresh: () => void;
  openPayModal: () => void;
  recordEventFee: (opts: {
    eventType: BettingFeeEventType;
    marketName: string;
    outcomeId?: number;
    notionalUsd: number;
  }) => Promise<void>;
};

const DISABLED_CTX: BettingFeeCtx = {
  accruedUsd: 0,
  bettingBlocked: false,
  feesWaived: true,
  feesDue: false,
  events: [],
  refresh: () => undefined,
  openPayModal: () => undefined,
  recordEventFee: async () => undefined,
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
  const bettingBlocked = !feesWaived && fees.status.bettingBlocked;
  const feesDue = !feesWaived && accruedUsd > 0.000_001;

  const openPayModal = useCallback(() => {
    if (feeExempt || !BETTING_ACCRUED_FEES_ENABLED) return;
    setModalOpen(true);
  }, [feeExempt]);

  const handlePaymentSuccess = useCallback(() => {
    showToast('Betting fees paid — you can place your next bet', 3200);
    void fees.refresh();
  }, [showToast, fees.refresh]);

  const recordEventFee = useCallback(
    async (opts: {
      eventType: BettingFeeEventType;
      marketName: string;
      outcomeId?: number;
      notionalUsd: number;
    }) => {
      if (!wallet || feesWaived || !BETTING_ACCRUED_FEES_ENABLED) return;
      const externalRef = `betting:${opts.eventType}:${wallet.toLowerCase()}:${crypto.randomUUID()}`;
      const result = await recordBettingFeeEvent({
        wallet,
        eventType: opts.eventType,
        marketName: opts.marketName,
        outcomeId: opts.outcomeId,
        notionalUsd: opts.notionalUsd,
        externalRef,
      });
      if (result.status) {
        await fees.refresh();
      }
      if ((result.feeUsd ?? 0) > 0) {
        setModalOpen(true);
      }
    },
    [wallet, feesWaived, fees.refresh]
  );

  useEffect(() => {
    if (feeExempt || !BETTING_ACCRUED_FEES_ENABLED) {
      setModalOpen(false);
      setAutoPrompted(false);
      return;
    }
    if (feesDue && !autoPrompted) {
      setModalOpen(true);
      setAutoPrompted(true);
    }
    if (!feesDue) {
      setAutoPrompted(false);
    }
  }, [feeExempt, feesDue, autoPrompted]);

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
      bettingBlocked,
      feesWaived,
      feesDue,
      events: fees.events,
      refresh: fees.refresh,
      openPayModal,
      recordEventFee,
    }),
    [accruedUsd, bettingBlocked, feesWaived, feesDue, fees.events, fees.refresh, openPayModal, recordEventFee]
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
        treasuryAddress={fees.treasuryAddress}
        events={fees.events}
        onPaid={fees.confirmPayment}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </Ctx.Provider>
  );
};
