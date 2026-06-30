import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, Wallet } from 'lucide-react';
import { useWalletClient } from 'wagmi';
import { createHlExchangeClient } from '../../lib/hyperliquid/exchange';
import { fetchHlAccountState } from '../../lib/hyperliquid/user';
import { toNum } from '../../lib/hyperliquid/parse';
import type { PlatformFeeTrade } from '../../lib/platformFeesApi';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { fireProfileOnboardingConfetti } from '../../lib/confettiCelebration';
import { BRAND_NAME } from '../../lib/brand';

type PayPhase = 'idle' | 'wallet' | 'confirming' | 'success';

type Props = {
  open: boolean;
  onClose: () => void;
  payerWallet?: string | null;
  accruedUsd: number;
  successWinCount: number;
  winsBeforeBlock: number;
  opensBlocked: boolean;
  builderAddress: string;
  trades: PlatformFeeTrade[];
  onPaid: (amountUsd: number, paymentRef?: string) => Promise<boolean>;
  onPaymentSuccess?: () => void;
};

const VISIBLE_ROWS = 5;
const SUCCESS_CLOSE_MS = 2400;

const PlatformFeePayModal: React.FC<Props> = ({
  open,
  onClose,
  payerWallet,
  accruedUsd,
  successWinCount,
  winsBeforeBlock,
  opensBlocked,
  builderAddress,
  trades,
  onPaid,
  onPaymentSuccess,
}) => {
  const { data: walletClient } = useWalletClient();
  const [phase, setPhase] = useState<PayPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [withdrawableUsd, setWithdrawableUsd] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const winTrades = useMemo(
    () => trades.filter((t) => t.totalFeeUsd > 0 && t.grossProfitUsd > 0),
    [trades]
  );

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setError(null);
      setWithdrawableUsd(null);
      return;
    }
    const w = payerWallet?.trim().toLowerCase();
    if (!w) {
      setWithdrawableUsd(null);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    void fetchHlAccountState(w)
      .then((acct) => {
        if (!cancelled) setWithdrawableUsd(toNum(acct.withdrawable));
      })
      .catch(() => {
        if (!cancelled) setWithdrawableUsd(null);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, payerWallet]);

  useEffect(() => {
    if (phase !== 'success') return;
    fireProfileOnboardingConfetti();
    onPaymentSuccess?.();
    const timer = window.setTimeout(() => {
      onClose();
      setPhase('idle');
    }, SUCCESS_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, onClose, onPaymentSuccess]);

  if (!open) return null;

  const busy = phase === 'wallet' || phase === 'confirming';

  const insufficientBalance =
    withdrawableUsd != null && accruedUsd > 0 && withdrawableUsd + 0.001 < accruedUsd;

  const handlePay = useCallback(async () => {
    if (!walletClient || accruedUsd <= 0 || busy) return;
    if (insufficientBalance) {
      setError(
        `Not enough Hyperliquid withdrawable balance (${fmtUsdSymbol(withdrawableUsd ?? 0)}). Deposit USDC on Hyperliquid first.`
      );
      return;
    }
    setPhase('wallet');
    setError(null);
    try {
      const client = createHlExchangeClient(walletClient);
      const amount = accruedUsd.toFixed(2);
      await client.usdSend({
        destination: builderAddress as `0x${string}`,
        amount,
      });
      setPhase('confirming');
      const ok = await onPaid(accruedUsd, `hl_usd_send:${Date.now()}`);
      if (!ok) {
        setPhase('idle');
        setError('Payment sent but confirmation failed — contact support if fees stay due.');
        return;
      }
      setPhase('success');
    } catch (err: unknown) {
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Payment failed');
    }
  }, [
    walletClient,
    accruedUsd,
    busy,
    insufficientBalance,
    withdrawableUsd,
    builderAddress,
    onPaid,
  ]);

  if (phase === 'success') {
    return (
      <div className="hl-fee-modal-backdrop" role="dialog" aria-modal aria-labelledby="hl-fee-modal-success">
        <div className="hl-fee-modal hl-fee-modal--success">
          <div className="hl-fee-modal-success-body">
            <div className="hl-fee-modal-success-icon" aria-hidden>
              <CheckCircle size={56} strokeWidth={1.5} />
            </div>
            <h2 id="hl-fee-modal-success">Payment successful</h2>
            <p>Your account is ready to trade again.</p>
          </div>
        </div>
      </div>
    );
  }

  const phaseLabel =
    phase === 'wallet'
      ? 'Confirm in your wallet…'
      : phase === 'confirming'
        ? 'Confirming payment…'
        : null;

  return (
    <div className="hl-fee-modal-backdrop" role="dialog" aria-modal aria-labelledby="hl-fee-modal-title">
      <div className="hl-fee-modal">
        <header className="hl-fee-modal-head">
          <h2 id="hl-fee-modal-title">{BRAND_NAME} platform fees</h2>
          <button
            type="button"
            className="hl-fee-modal-close"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            ×
          </button>
        </header>

        <p className="hl-fee-modal-lead">
          {opensBlocked
            ? `Pay outstanding fees to continue using the bot and withdraw from ${BRAND_NAME}.`
            : 'Success fee on winning closes — part is collected on-chain via HL builder; the rest accrues here.'}
        </p>

        <p className="hl-fee-modal-hint">
          Paid from your <strong>Hyperliquid perp USD balance</strong> (USDC on HL — not Arbitrum).
          Sign the transfer in your wallet; no gas on Arbitrum.
        </p>

        <div className="hl-fee-modal-kpis">
          <div>
            <span className="hl-fee-modal-kpi-label">Fees owed</span>
            <strong className="hl-fee-modal-kpi-value">{fmtUsdSymbol(accruedUsd)}</strong>
          </div>
          <div>
            <span className="hl-fee-modal-kpi-label">HL withdrawable</span>
            <strong className="hl-fee-modal-kpi-value">
              {balanceLoading ? '…' : withdrawableUsd != null ? fmtUsdSymbol(withdrawableUsd) : '—'}
            </strong>
          </div>
          <div>
            <span className="hl-fee-modal-kpi-label">Win trades (10% fee)</span>
            <strong className="hl-fee-modal-kpi-value">
              {successWinCount} / {winsBeforeBlock}
            </strong>
          </div>
        </div>

        <section className="hl-fee-modal-trades" aria-label="Successful trades">
          <h3>Win trades with platform fee ({winTrades.length})</h3>
          <div className="hl-fee-modal-trades-scroll">
            {winTrades.length === 0 ? (
              <p className="hl-fee-modal-empty">No fee entries yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Profit</th>
                    <th>Fee</th>
                    <th>HL</th>
                    <th>Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {winTrades.map((t) => (
                    <tr key={t.id}>
                      <td>{t.coin}</td>
                      <td>{fmtUsdSymbol(t.grossProfitUsd)}</td>
                      <td>{fmtUsdSymbol(t.totalFeeUsd)}</td>
                      <td>{fmtUsdSymbol(t.builderFeeUsd)}</td>
                      <td>{fmtUsdSymbol(t.accruedFeeUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {winTrades.length > VISIBLE_ROWS ? (
            <p className="hl-fee-modal-scroll-hint">Scroll for all {winTrades.length} trades</p>
          ) : null}
        </section>

        {phaseLabel ? (
          <p className="hl-fee-modal-phase" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {phaseLabel}
          </p>
        ) : null}

        {insufficientBalance ? (
          <p className="hl-fee-modal-error" role="alert">
            Insufficient Hyperliquid balance — deposit USDC on Hyperliquid before paying fees.
          </p>
        ) : null}

        {error ? <p className="hl-fee-modal-error">{error}</p> : null}

        <footer className="hl-fee-modal-actions">
          <button type="button" className="hl-fee-modal-cancel" onClick={onClose} disabled={busy}>
            Later
          </button>
          <button
            type="button"
            className="hl-fee-modal-pay"
            onClick={() => void handlePay()}
            disabled={busy || accruedUsd <= 0 || !walletClient || insufficientBalance}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
            Pay {fmtUsdSymbol(accruedUsd)} now
          </button>
        </footer>
      </div>
    </div>
  );
};

export default PlatformFeePayModal;
