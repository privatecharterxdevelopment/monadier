import React, { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useChainId, useSwitchChain } from 'wagmi';
import { arbitrum } from 'viem/chains';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { HL_ARBITRUM_CHAIN_ID, HL_MIN_DEPOSIT_USDC } from '../../lib/hyperliquid/bridge';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
  withdrawable?: string;
  initialTab?: 'deposit' | 'withdraw';
};

const ProTradeDepositModal: React.FC<Props> = ({
  onClose,
  onSuccess,
  withdrawable,
  initialTab = 'deposit',
}) => {
  const { address } = useAppKitAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { deposit, withdraw, busy, error } = useHyperliquidTrading();
  const [tab, setTab] = useState<'deposit' | 'withdraw'>(initialTab);
  const [amount, setAmount] = useState('');
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);

  const onArbitrum = chainId === HL_ARBITRUM_CHAIN_ID;
  const depositBlocked = tab === 'deposit' && !onArbitrum;

  const handleSwitchNetwork = async () => {
    try {
      setSwitchBusy(true);
      await switchChainAsync({ chainId: HL_ARBITRUM_CHAIN_ID });
    } catch {
      /* wallet rejected */
    } finally {
      setSwitchBusy(false);
    }
  };

  const handleDeposit = async () => {
    if (!onArbitrum) return;
    setLocalMsg(null);
    try {
      const hash = await deposit(amount);
      setLocalMsg(`Deposit sent — ${hash.slice(0, 10)}…`);
      onSuccess?.();
    } catch {
      /* error in hook */
    }
  };

  const handleWithdraw = async () => {
    if (!address) return;
    setLocalMsg(null);
    try {
      await withdraw(amount, address as `0x${string}`);
      setLocalMsg('Withdrawal requested (~3–4 min)');
      onSuccess?.();
    } catch {
      /* error in hook */
    }
  };

  return (
    <div className="hl-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="hl-modal hl-modal--sm"
        role="dialog"
        aria-labelledby="pro-funds-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hl-modal-head">
          <h2 id="pro-funds-title" className="hl-modal-title">
            Hyperliquid funds
          </h2>
          <button type="button" className="hl-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="hl-entry-hint" style={{ marginBottom: 12 }}>
          Bridge USDC to your Hyperliquid account. This is separate from the GMX bot vault on Arbitrum.
        </p>

        <div className="term-pro-funds-tabs">
          <button
            type="button"
            className={tab === 'deposit' ? 'term-pro-funds-tab--on' : ''}
            onClick={() => setTab('deposit')}
          >
            Deposit
          </button>
          <button
            type="button"
            className={tab === 'withdraw' ? 'term-pro-funds-tab--on' : ''}
            onClick={() => setTab('withdraw')}
          >
            Withdraw
          </button>
        </div>

        {tab === 'deposit' && !onArbitrum ? (
          <div className="term-arb-gate term-arb-gate--inline" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} aria-hidden />
            <div className="term-arb-gate__text">
              <strong>Arbitrum required</strong>
              <span>
                HL deposits bridge USDC from {arbitrum.name}. Switch network before sending.
              </span>
            </div>
            <button
              type="button"
              className="term-btn-sm"
              onClick={() => void handleSwitchNetwork()}
              disabled={switchBusy}
            >
              {switchBusy ? <Loader2 size={14} className="animate-spin" /> : 'Switch to Arbitrum'}
            </button>
          </div>
        ) : null}

        {tab === 'deposit' ? (
          <p className="hl-entry-hint">
            Send USDC from Arbitrum to Hyperliquid (min {HL_MIN_DEPOSIT_USDC} USDC). Credits in ~1 min.
          </p>
        ) : (
          <p className="hl-entry-hint">
            Withdrawable: {fmtUsdSymbol(withdrawable)}
          </p>
        )}

        <label className="term-profile-label">Amount (USDC)</label>
        <input
          className="term-profile-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={tab === 'deposit' ? String(HL_MIN_DEPOSIT_USDC) : '0'}
          inputMode="decimal"
        />

        {(error || localMsg) && (
          <p className={error ? 'term-profile-err' : 'term-profile-ok'}>{error || localMsg}</p>
        )}

        <button
          type="button"
          className="term-modal-primary"
          disabled={busy || (!depositBlocked && !amount)}
          onClick={
            depositBlocked
              ? () => void handleSwitchNetwork()
              : tab === 'deposit'
                ? handleDeposit
                : handleWithdraw
          }
        >
          {busy || switchBusy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : depositBlocked ? (
            'Switch to Arbitrum'
          ) : tab === 'deposit' ? (
            'Deposit USDC'
          ) : (
            'Withdraw USDC'
          )}
        </button>
      </div>
    </div>
  );
};

export default ProTradeDepositModal;
