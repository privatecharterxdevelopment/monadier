import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, Wallet } from 'lucide-react';
import { usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import type { BettingFeeEvent } from '../../lib/betting/bettingFeesApi';
import {
  BETTING_WIN_FEE_LABEL,
} from '../../lib/betting/bettingAccruedFees';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { fireProfileOnboardingConfetti } from '../../lib/confettiCelebration';
import { BRAND_NAME } from '../../lib/brand';
import { ARBITRUM_ONE_CHAIN_ID } from '../../lib/usdcArbitrum';
import {
  fetchArbitrumUsdcBalance,
  transferArbitrumUsdc,
} from '../../lib/arbitrumUsdcTransfer';
import { HL_ARBITRUM_CHAIN_ID } from '../../lib/hyperliquid/bridge';

type PayPhase = 'idle' | 'wallet' | 'onchain' | 'confirming' | 'success';

type Props = {
  open: boolean;
  onClose: () => void;
  payerWallet?: string | null;
  accruedUsd: number;
  successWinCount?: number;
  winsBeforeBlock?: number;
  treasuryAddress: string;
  events: BettingFeeEvent[];
  onPaid: (amountUsd: number, paymentRef?: string) => Promise<boolean>;
  onPaymentSuccess?: () => void;
};

const SUCCESS_CLOSE_MS = 2400;

function eventFeeLabel(_event: BettingFeeEvent): string {
  return BETTING_WIN_FEE_LABEL;
}

const BettingFeePayModal: React.FC<Props> = ({
  open,
  onClose,
  payerWallet,
  accruedUsd,
  successWinCount = 0,
  winsBeforeBlock = 1,
  treasuryAddress,
  events = [],
  onPaid,
  onPaymentSuccess,
}) => {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: HL_ARBITRUM_CHAIN_ID });
  const { switchChainAsync } = useSwitchChain();
  const [phase, setPhase] = useState<PayPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [arbitrumUsdc, setArbitrumUsdc] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const treasury = treasuryAddress?.trim().toLowerCase();
  const payer = payerWallet?.trim().toLowerCase() as `0x${string}` | undefined;

  const pendingEvents = useMemo(
    () => events.filter((e) => e.feeUsd > 0),
    [events]
  );

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setError(null);
      setTxHash(null);
      setArbitrumUsdc(null);
      return;
    }
    if (!payer || !publicClient) {
      setArbitrumUsdc(null);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    void fetchArbitrumUsdcBalance(publicClient, payer)
      .then((bal) => {
        if (!cancelled) setArbitrumUsdc(bal);
      })
      .catch(() => {
        if (!cancelled) setArbitrumUsdc(null);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, payer, publicClient]);

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

  const busy = phase === 'wallet' || phase === 'onchain' || phase === 'confirming';
  const treasuryReady = Boolean(treasury && /^0x[a-f0-9]{40}$/.test(treasury));

  const insufficientBalance =
    arbitrumUsdc != null && accruedUsd > 0 && arbitrumUsdc + 0.001 < accruedUsd;

  const handlePay = useCallback(async () => {
    if (!walletClient || !payer || accruedUsd <= 0 || busy) return;
    if (!treasuryReady) {
      setError('Platform treasury wallet is not configured — contact support.');
      return;
    }
    if (insufficientBalance) {
      setError(
        `Not enough USDC on Arbitrum (${fmtUsdSymbol(arbitrumUsdc ?? 0)}). Withdraw from Hyperliquid to MetaMask or deposit native USDC on Arbitrum.`
      );
      return;
    }

    setPhase('wallet');
    setError(null);
    setTxHash(null);
    try {
      if (walletClient.chain?.id !== HL_ARBITRUM_CHAIN_ID && switchChainAsync) {
        await switchChainAsync({ chainId: ARBITRUM_ONE_CHAIN_ID });
      }

      const hash = await transferArbitrumUsdc(
        walletClient,
        treasury as `0x${string}`,
        accruedUsd
      );
      setTxHash(hash);
      setPhase('onchain');

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        if (receipt.status === 'reverted') {
          throw new Error('USDC transfer reverted on Arbitrum.');
        }
      }

      setPhase('confirming');
      const ok = await onPaid(accruedUsd, `arbitrum_usdc:${hash}`);
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
    payer,
    accruedUsd,
    busy,
    treasuryReady,
    treasury,
    insufficientBalance,
    arbitrumUsdc,
    switchChainAsync,
    publicClient,
    onPaid,
  ]);

  if (!open) return null;

  if (phase === 'success') {
    return (
      <div className="hl-fee-modal-backdrop" role="dialog" aria-modal aria-labelledby="hl-bet-fee-success">
        <div className="hl-fee-modal hl-fee-modal--success">
          <div className="hl-fee-modal-success-body">
            <div className="hl-fee-modal-success-icon" aria-hidden>
              <CheckCircle size={56} strokeWidth={1.5} />
            </div>
            <h2 id="hl-bet-fee-success">Betting fees paid</h2>
            <p>Withdraw unlocked and you can place your next bet. Bot trading is unaffected.</p>
          </div>
        </div>
      </div>
    );
  }

  const phaseLabel =
    phase === 'wallet'
      ? 'Confirm USDC transfer in MetaMask (Arbitrum)…'
      : phase === 'onchain'
        ? 'Waiting for Arbitrum confirmation…'
        : phase === 'confirming'
          ? 'Verifying payment on-chain…'
          : null;

  const arbiscanTxUrl = txHash ? `https://arbiscan.io/tx/${txHash}` : null;

  return (
    <div className="hl-fee-modal-backdrop" role="dialog" aria-modal aria-labelledby="hl-bet-fee-title">
      <div className="hl-fee-modal">
        <header className="hl-fee-modal-head">
          <h2 id="hl-bet-fee-title">Sports betting fees</h2>
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
          You won {successWinCount}/{winsBeforeBlock} — pay {fmtUsdSymbol(accruedUsd)} on-chain to
          place your next bet. Fee is {BETTING_WIN_FEE_LABEL} on winning cash-outs only (separate
          from bot trading fees).
        </p>

        <p className="hl-fee-modal-hint">
          Send <strong>native USDC on Arbitrum One</strong> from your MetaMask wallet to the platform
          treasury. Small ETH on Arbitrum is required for gas.
        </p>

        {treasuryReady ? (
          <p className="hl-fee-modal-hint hl-fee-modal-hint--mono">
            To: {treasury.slice(0, 10)}…{treasury.slice(-8)}
          </p>
        ) : null}

        <div className="hl-fee-modal-kpis">
          <div>
            <span className="hl-fee-modal-kpi-label">Fees owed</span>
            <strong className="hl-fee-modal-kpi-value">{fmtUsdSymbol(accruedUsd)}</strong>
          </div>
          <div>
            <span className="hl-fee-modal-kpi-label">Arbitrum USDC</span>
            <strong className="hl-fee-modal-kpi-value">
              {balanceLoading ? '…' : arbitrumUsdc != null ? fmtUsdSymbol(arbitrumUsdc) : '—'}
            </strong>
          </div>
          <div>
            <span className="hl-fee-modal-kpi-label">Pending events</span>
            <strong className="hl-fee-modal-kpi-value">{pendingEvents.length}</strong>
          </div>
        </div>

        <section className="hl-fee-modal-trades" aria-label="Betting fee events">
          <h3>Unpaid events ({pendingEvents.length})</h3>
          <div className="hl-fee-modal-trades-scroll">
            {pendingEvents.length === 0 ? (
              <p className="hl-fee-modal-empty">No pending betting fees.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Type</th>
                    <th>Notional</th>
                    <th>Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingEvents.map((e) => (
                    <tr key={e.id}>
                      <td>{e.marketName}</td>
                      <td>{e.eventType === 'buy' ? 'Bet' : 'Cash out'}</td>
                      <td>{fmtUsdSymbol(e.notionalUsd)}</td>
                      <td>
                        {fmtUsdSymbol(e.feeUsd)}{' '}
                        <span className="hl-bet-fee-rate">({eventFeeLabel(e)})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {phaseLabel ? (
          <div className="hl-fee-modal-phase" role="status">
            <p>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              {phaseLabel}
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="hl-fee-modal-error" role="alert">
            {error}
          </p>
        ) : null}

        {arbiscanTxUrl ? (
          <p className="hl-fee-modal-hint">
            <a href={arbiscanTxUrl} target="_blank" rel="noreferrer">
              View on Arbiscan
            </a>
          </p>
        ) : null}

        <footer className="hl-fee-modal-foot">
          <button type="button" className="hl-fee-modal-cancel" onClick={onClose} disabled={busy}>
            Later
          </button>
          <button
            type="button"
            className="hl-fee-modal-pay"
            onClick={() => void handlePay()}
            disabled={busy || accruedUsd <= 0 || !walletClient}
          >
            <Wallet size={16} aria-hidden />
            Pay {fmtUsdSymbol(accruedUsd)} on Arbitrum
          </button>
        </footer>
      </div>
    </div>
  );
};

export default BettingFeePayModal;
