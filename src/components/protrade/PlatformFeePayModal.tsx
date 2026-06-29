import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, Wallet } from 'lucide-react';
import { useWalletClient } from 'wagmi';
import { createHlExchangeClient } from '../../lib/hyperliquid/exchange';
import type { PlatformFeeTrade } from '../../lib/platformFeesApi';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { fireProfileOnboardingConfetti } from '../../lib/confettiCelebration';

type PayPhase = 'idle' | 'wallet' | 'confirming' | 'success';

type Props = {
  open: boolean;
  onClose: () => void;
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

  const winTrades = useMemo(
    () => trades.filter((t) => t.grossProfitUsd > 0),
    [trades]
  );

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setError(null);
    }
  }, [open]);

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

  const handlePay = async () => {
    if (!walletClient || accruedUsd <= 0 || busy) return;
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
  };

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
          <h2 id="hl-fee-modal-title">Monadier platform fees</h2>
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
            ? 'Pay outstanding fees to continue using the bot and withdraw from Monadier.'
            : 'Success fee on winning closes — HL builder collects the on-chain portion; the rest accrues here.'}
        </p>

        <div className="hl-fee-modal-kpis">
          <div>
            <span className="hl-fee-modal-kpi-label">Fees owed</span>
            <strong className="hl-fee-modal-kpi-value">{fmtUsdSymbol(accruedUsd)}</strong>
          </div>
          <div>
            <span className="hl-fee-modal-kpi-label">Winning closes</span>
            <strong className="hl-fee-modal-kpi-value">
              {successWinCount} / {winsBeforeBlock}
            </strong>
          </div>
        </div>

        <section className="hl-fee-modal-trades" aria-label="Successful trades">
          <h3>Successful trades ({winTrades.length})</h3>
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

        {error ? <p className="hl-fee-modal-error">{error}</p> : null}

        <footer className="hl-fee-modal-actions">
          <button type="button" className="hl-fee-modal-cancel" onClick={onClose} disabled={busy}>
            Later
          </button>
          <button
            type="button"
            className="hl-fee-modal-pay"
            onClick={() => void handlePay()}
            disabled={busy || accruedUsd <= 0 || !walletClient}
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
