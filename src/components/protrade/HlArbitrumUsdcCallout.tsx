import React, { useEffect, useId, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Loader2 } from 'lucide-react';
import {
  HL_DEPOSIT_RULE_HEADLINE,
  hlDepositWrongNetworkMessage,
} from '../../lib/hlDepositRules';
import { useMultiChainUsdcBalances } from '../../hooks/useMultiChainUsdcBalances';

const ARBITRUM_LOGO = '/images/partners/arbitrum.svg';
const USDC_LOGO = '/images/partners/usdc.svg';

type Props = {
  onArbitrum: boolean;
  chainId?: number;
  switchBusy?: boolean;
  onSwitch?: () => void;
  /** Arbitrum native USDC (already fetched by parent for Max button). */
  usdcBalance?: number;
  balanceLoading?: boolean;
  showBalance?: boolean;
  compact?: boolean;
  /** Wallet to scan for USDC on Ethereum / Base / etc. */
  walletAddress?: string | null;
};

const HlArbitrumUsdcCallout: React.FC<Props> = ({
  onArbitrum,
  chainId,
  switchBusy = false,
  onSwitch,
  usdcBalance = 0,
  balanceLoading = false,
  showBalance = false,
  compact = false,
  walletAddress,
}) => {
  const wrongNetwork = hlDepositWrongNetworkMessage(chainId);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  const { rows, loading: multiLoading, strandedUsdc } = useMultiChainUsdcBalances(
    showBalance ? (walletAddress ?? undefined) : undefined
  );

  // Auto-expand when USDC sits on the wrong chain and Arbitrum is empty.
  useEffect(() => {
    if (autoOpened || !showBalance) return;
    if (strandedUsdc >= 1 && usdcBalance < 1) {
      setOpen(true);
      setAutoOpened(true);
    }
  }, [autoOpened, showBalance, strandedUsdc, usdcBalance]);

  const balanceLabel = balanceLoading
    ? '…'
    : `${usdcBalance.toFixed(2)} USDC · Arbitrum`;

  return (
    <div className={`hl-funds-deposit-rules${compact ? ' hl-funds-deposit-rules--compact' : ''}`}>
      <div
        className={`hl-funds-chain ${onArbitrum ? 'hl-funds-chain--ready' : 'hl-funds-chain--switch'}`}
        role="status"
      >
        <div className="hl-funds-chain__brand" aria-hidden>
          <img src={ARBITRUM_LOGO} alt="" className="hl-funds-chain__logo hl-funds-chain__logo--arb" />
          <img src={USDC_LOGO} alt="" className="hl-funds-chain__logo hl-funds-chain__logo--usdc" />
        </div>

        <div className="hl-funds-chain__copy">
          <div className="hl-funds-chain__title-row">
            <strong className="hl-funds-chain__title">
              {compact ? 'Native USDC · Arbitrum' : HL_DEPOSIT_RULE_HEADLINE}
            </strong>
            {onArbitrum ? (
              <span className="hl-funds-chain__badge hl-funds-chain__badge--ok">
                <Check size={12} aria-hidden />
                OK
              </span>
            ) : (
              <span className="hl-funds-chain__badge hl-funds-chain__badge--warn">Switch</span>
            )}
          </div>
          {wrongNetwork ? (
            <p className="hl-funds-chain__wrong-net">
              <AlertTriangle size={14} aria-hidden />
              {wrongNetwork}
            </p>
          ) : null}
          {showBalance ? (
            <button
              type="button"
              className={`hl-funds-chain__balance hl-funds-chain__balance--btn${open ? ' is-open' : ''}`}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
              title="Show USDC on other chains"
            >
              <span>
                Wallet: <strong>{balanceLabel}</strong>
                {strandedUsdc >= 1 && !open ? (
                  <span className="hl-funds-chain__stranded-hint">
                    {' '}
                    · {strandedUsdc.toFixed(0)} USDC on other chains
                  </span>
                ) : null}
              </span>
              <ChevronDown size={14} className="hl-funds-chain__balance-chevron" aria-hidden />
            </button>
          ) : null}
        </div>

        {!onArbitrum && onSwitch ? (
          <button
            type="button"
            className="hl-funds-chain__action"
            disabled={switchBusy}
            onClick={() => void onSwitch()}
          >
            {switchBusy ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <img src={ARBITRUM_LOGO} alt="" className="hl-funds-chain__action-logo" aria-hidden />
            )}
            Arbitrum
          </button>
        ) : null}
      </div>

      {showBalance && open ? (
        <div id={panelId} className="hl-funds-chain-balances" role="region" aria-label="USDC by chain">
          <p className="hl-funds-chain-balances__intro">
            Hyperliquid only accepts <strong>native USDC on Arbitrum</strong>. If your USDC sits on
            Ethereum / Base / etc., bridge or withdraw it to Arbitrum first.
          </p>
          {multiLoading && rows.length === 0 ? (
            <p className="hl-funds-chain-balances__loading">
              <Loader2 size={14} className="animate-spin" aria-hidden /> Checking other chains…
            </p>
          ) : (
            <ul className="hl-funds-chain-balances__list">
              {(rows.length > 0
                ? rows
                : [
                    {
                      chainId: 42161,
                      shortLabel: 'Arbitrum',
                      label: 'Arbitrum One',
                      balanceUsd: usdcBalance,
                      depositReady: true,
                      usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
                    },
                  ]
              ).map((row) => {
                const has = row.balanceUsd >= 0.01;
                return (
                  <li
                    key={row.chainId}
                    className={`hl-funds-chain-balances__row${
                      row.depositReady ? ' hl-funds-chain-balances__row--ok' : ''
                    }${has && !row.depositReady ? ' hl-funds-chain-balances__row--warn' : ''}`}
                  >
                    <span className="hl-funds-chain-balances__chain">{row.shortLabel}</span>
                    <span className="hl-funds-chain-balances__amt">
                      {multiLoading && !has ? '…' : `${row.balanceUsd.toFixed(2)} USDC`}
                    </span>
                    <span className="hl-funds-chain-balances__tag">
                      {row.depositReady ? 'Deposit here' : has ? 'Wrong chain' : '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {strandedUsdc >= 1 ? (
            <p className="hl-funds-chain-balances__tip">
              You have <strong>{strandedUsdc.toFixed(2)} USDC</strong> on other networks — bridge to
              Arbitrum, then deposit.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default HlArbitrumUsdcCallout;
