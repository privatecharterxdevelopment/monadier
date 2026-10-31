import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { hlWalletExplorerUrl } from '../../lib/hyperliquid/hlApp';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { fireDepositSuccessConfetti } from '../../lib/confettiCelebration';

const ARBISCAN_TX = 'https://arbiscan.io/tx/';

export type HlDepositFlowState =
  | { phase: 'idle' }
  | { phase: 'signing' }
  | { phase: 'bridging'; txHash: string; amountUsd: number }
  | { phase: 'success'; txHash: string; amountUsd: number; totalUsd: number }
  | { phase: 'delayed'; txHash: string; amountUsd: number; totalUsd: number }
  | { phase: 'error'; message: string; txHash?: string };

type Props = {
  flow: HlDepositFlowState;
  walletAddress?: string;
  onDismiss: () => void;
  onRetryRefresh?: () => void;
  refreshBusy?: boolean;
};

const HlDepositFlowOverlay: React.FC<Props> = ({
  flow,
  walletAddress,
  onDismiss,
  onRetryRefresh,
  refreshBusy = false,
}) => {
  useEffect(() => {
    if (flow.phase === 'success') fireDepositSuccessConfetti();
  }, [flow.phase]);

  if (flow.phase === 'idle') return null;

  const txHash =
    flow.phase === 'bridging' ||
    flow.phase === 'success' ||
    flow.phase === 'delayed' ||
    flow.phase === 'error'
      ? flow.txHash
      : undefined;
  const showLinks = Boolean(txHash || walletAddress);

  return (
    <div
      className={`hl-deposit-flow hl-deposit-flow--${flow.phase}`}
      role="status"
      aria-live="polite"
    >
      {flow.phase === 'signing' ? (
        <>
          <div className="hl-deposit-flow__ring" aria-hidden>
            <Loader2 size={34} className="hl-deposit-flow__spin" />
          </div>
          <h3 className="hl-deposit-flow__title">Confirm in your wallet</h3>
          <p className="hl-deposit-flow__desc">
            Approve the USDC transfer on Arbitrum to send funds to Hyperliquid.
          </p>
        </>
      ) : null}

      {flow.phase === 'bridging' ? (
        <>
          <div className="hl-deposit-flow__ring hl-deposit-flow__ring--bridge" aria-hidden>
            <span className="hl-deposit-flow__pulse" />
            <Loader2 size={30} className="hl-deposit-flow__spin" />
          </div>
          <h3 className="hl-deposit-flow__title">Depositing to Hyperliquid</h3>
          <p className="hl-deposit-flow__desc">
            Sent {fmtUsdSymbol(flow.amountUsd)} USDC on Arbitrum — waiting for confirmation and HL
            credit (~1–3 min).
          </p>
          <ol className="hl-deposit-flow__steps">
            <li className="hl-deposit-flow__step hl-deposit-flow__step--on">Wallet signed</li>
            <li className="hl-deposit-flow__step hl-deposit-flow__step--on">Arbitrum confirmed</li>
            <li className="hl-deposit-flow__step">Hyperliquid credit</li>
          </ol>
        </>
      ) : null}

      {flow.phase === 'success' ? (
        <>
          <CheckCircle2 size={42} className="hl-deposit-flow__icon hl-deposit-flow__icon--ok" />
          <h3 className="hl-deposit-flow__title">Deposit successful</h3>
          <p className="hl-deposit-flow__desc">
            {fmtUsdSymbol(flow.amountUsd)} credited — total on Hyperliquid{' '}
            <strong>{fmtUsdSymbol(flow.totalUsd)}</strong>.
          </p>
          <button type="button" className="term-modal-primary hl-deposit-flow__cta" onClick={onDismiss}>
            Done
          </button>
        </>
      ) : null}

      {flow.phase === 'delayed' ? (
        <>
          <AlertTriangle size={40} className="hl-deposit-flow__icon hl-deposit-flow__icon--warn" />
          <h3 className="hl-deposit-flow__title">Still processing</h3>
          <p className="hl-deposit-flow__desc">
            Arbitrum tx went through, but Hyperliquid has not credited {fmtUsdSymbol(flow.amountUsd)}{' '}
            yet. This can take a few minutes — check your wallet on HypurrScan.
          </p>
          <p className="hl-deposit-flow__meta">
            Current HL total: <strong>{fmtUsdSymbol(flow.totalUsd)}</strong>
          </p>
          <div className="hl-deposit-flow__actions">
            <button
              type="button"
              className="term-modal-primary hl-deposit-flow__cta"
              disabled={refreshBusy}
              onClick={() => onRetryRefresh?.()}
            >
              {refreshBusy ? <Loader2 size={16} className="animate-spin" /> : 'Refresh balance'}
            </button>
            <button type="button" className="term-btn-sm hl-deposit-flow__cta" onClick={onDismiss}>
              Close
            </button>
          </div>
        </>
      ) : null}

      {flow.phase === 'error' ? (
        <>
          <XCircle size={40} className="hl-deposit-flow__icon hl-deposit-flow__icon--err" />
          <h3 className="hl-deposit-flow__title">Something went wrong</h3>
          <p className="hl-deposit-flow__desc">{flow.message}</p>
          <div className="hl-deposit-flow__actions">
            <button type="button" className="term-modal-primary hl-deposit-flow__cta" onClick={onDismiss}>
              Try again
            </button>
          </div>
        </>
      ) : null}

      {showLinks ? (
        <div className="hl-deposit-flow__links">
          {txHash ? (
            <a href={`${ARBISCAN_TX}${txHash}`} target="_blank" rel="noreferrer">
              Arbitrum tx <ExternalLink size={12} />
            </a>
          ) : null}
          {walletAddress ? (
            <a href={hlWalletExplorerUrl(walletAddress)} target="_blank" rel="noreferrer">
              HypurrScan wallet <ExternalLink size={12} />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default HlDepositFlowOverlay;
