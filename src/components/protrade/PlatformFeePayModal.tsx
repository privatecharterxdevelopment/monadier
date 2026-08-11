import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, Wallet } from 'lucide-react';
import { usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import type { PlatformFeeTrade } from '../../lib/platformFeesApi';
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
  successWinCount: number;
  winsBeforeBlock: number;
  opensBlocked: boolean;
  withdrawBlocked?: boolean;
  treasuryAddress: string;
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
  withdrawBlocked = false,
  treasuryAddress,
  trades = [],
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

  const treasuryDisplay = (() => {
    const raw = treasuryAddress?.trim();
    if (!raw || !/^0x[a-fA-F0-9]{40}$/.test(raw)) return '';
    const canonical = '0x1fBc2A0Ab6a8fA5F6B9645392433483b25a8Cd84';
    if (raw.toLowerCase() === canonical.toLowerCase()) return canonical;
    return raw;
  })();
  const treasury = treasuryDisplay.toLowerCase();
  const payer = payerWallet?.trim().toLowerCase() as `0x${string}` | undefined;

  const winTrades = useMemo(
    () => (trades ?? []).filter((t) => t.totalFeeUsd > 0 && t.grossProfitUsd > 0),
    [trades]
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
      setError(`Not enough USDC on Arbitrum (${fmtUsdSymbol(arbitrumUsdc ?? 0)}).`);
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
      <div className="hl-fee-modal-backdrop" role="dialog" aria-modal aria-labelledby="hl-fee-modal-success">
        <div className="hl-fee-modal hl-fee-modal--success">
          <div className="hl-fee-modal-success-body">
            <div className="hl-fee-modal-success-icon" aria-hidden>
              <CheckCircle size={56} strokeWidth={1.5} />
            </div>
            <h2 id="hl-fee-modal-success">Payment successful</h2>
            <p>
              {opensBlocked
                ? 'Fees paid — bot can open new trades again.'
                : 'Fees paid successfully.'}
            </p>
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
            ? 'Pay outstanding fees to restart the bot.'
            : withdrawBlocked
              ? `Pay ${fmtUsdSymbol(accruedUsd)} now. Bot trading continues until ${winsBeforeBlock} wins.`
              : '10% success fee on winning closes — pay accrued fees here anytime.'}
        </p>

        <p className="hl-fee-modal-hint">
          Pay with <strong>native USDC on Arbitrum One</strong> from MetaMask to the admin wallet.
          Small ETH on Arbitrum is required for gas.
        </p>

        {treasuryReady ? (
          <p className="hl-fee-modal-hint hl-fee-modal-hint--mono">
            To (Arbitrum USDC): {treasuryDisplay}
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
                    <th>Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {winTrades.map((t) => (
                    <tr key={t.id}>
                      <td>{t.coin}</td>
                      <td>{fmtUsdSymbol(t.grossProfitUsd)}</td>
                      <td>{fmtUsdSymbol(t.totalFeeUsd)}</td>
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
          <div className="hl-fee-modal-phase" role="status">
            <p>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              {phaseLabel}
            </p>
            {txHash && arbiscanTxUrl ? (
              <p className="hl-fee-modal-hint hl-fee-modal-hint--mono">
                Tx:{' '}
                <a href={arbiscanTxUrl} target="_blank" rel="noopener noreferrer">
                  {txHash.slice(0, 10)}…{txHash.slice(-8)}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}

        {insufficientBalance ? (
          <p className="hl-fee-modal-error" role="alert">
            Not enough USDC on Arbitrum.
          </p>
        ) : null}

        {!treasuryReady ? (
          <p className="hl-fee-modal-error" role="alert">
            Platform treasury not configured (PLATFORM_FEE_TREASURY_ADDRESS).
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
            disabled={
              busy ||
              accruedUsd <= 0 ||
              !walletClient ||
              insufficientBalance ||
              !treasuryReady
            }
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
            Pay {fmtUsdSymbol(accruedUsd)} on Arbitrum
          </button>
        </footer>
      </div>
    </div>
  );
};

export default PlatformFeePayModal;
