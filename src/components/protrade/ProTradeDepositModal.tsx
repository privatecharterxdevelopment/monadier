import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { formatUnits } from 'viem';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useChainId, useSwitchChain } from 'wagmi';
import { arbitrum } from 'viem/chains';
import { useWeb3 } from '../../contexts/Web3Context';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { HL_ARBITRUM_CHAIN_ID, HL_MIN_DEPOSIT_USDC } from '../../lib/hyperliquid/bridge';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { USDC_ADDRESSES, USDC_DECIMALS, VAULT_CHAIN_ID } from '../../lib/vault';
import { ERC20_ABI } from '../../lib/dex/router';

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
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { publicClient, walletClient } = useWeb3();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { deposit, withdraw, busy, error, walletReady } = useHyperliquidTrading();
  const [tab, setTab] = useState<'deposit' | 'withdraw'>(initialTab);
  const [amount, setAmount] = useState('');
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState('0');
  const [balanceLoading, setBalanceLoading] = useState(false);

  const onArbitrum = chainId === HL_ARBITRUM_CHAIN_ID;
  const depositBlocked = tab === 'deposit' && !onArbitrum;
  const usdcNum = parseFloat(usdcBalance) || 0;

  const suggestedDeposit = useMemo(() => {
    if (usdcNum < HL_MIN_DEPOSIT_USDC) return '';
    return usdcNum.toFixed(2);
  }, [usdcNum]);

  useEffect(() => {
    const load = async () => {
      if (!address || !publicClient || !onArbitrum) {
        setUsdcBalance('0');
        setBalanceLoading(false);
        return;
      }
      try {
        setBalanceLoading(true);
        const usdcAddress = USDC_ADDRESSES[VAULT_CHAIN_ID];
        if (!usdcAddress) {
          setUsdcBalance('0');
          return;
        }
        const balance = await publicClient.readContract({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        });
        setUsdcBalance(formatUnits(balance as bigint, USDC_DECIMALS));
      } catch {
        setUsdcBalance('0');
      } finally {
        setBalanceLoading(false);
      }
    };
    void load();
  }, [address, publicClient, onArbitrum]);

  const handleSwitchNetwork = async () => {
    try {
      setSwitchBusy(true);
      setLocalMsg(null);
      await switchChainAsync({ chainId: HL_ARBITRUM_CHAIN_ID });
    } catch {
      setLocalMsg('Could not switch network — approve in your wallet.');
    } finally {
      setSwitchBusy(false);
    }
  };

  const handleMax = () => {
    if (usdcNum <= 0) return;
    setAmount(usdcNum.toFixed(2));
    setLocalMsg(null);
  };

  const handleDeposit = async () => {
    if (!isConnected || !address) {
      open();
      return;
    }
    if (!onArbitrum) {
      await handleSwitchNetwork();
      return;
    }
    if (!walletClient || !walletReady) {
      setLocalMsg('Wallet not ready — open your wallet app or reconnect, then try again.');
      return;
    }

    let depositAmount = amount.trim();
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      if (suggestedDeposit) {
        depositAmount = suggestedDeposit;
        setAmount(suggestedDeposit);
      } else {
        setLocalMsg(`Enter at least ${HL_MIN_DEPOSIT_USDC} USDC.`);
        return;
      }
    }

    const usd = parseFloat(depositAmount);
    if (usd < HL_MIN_DEPOSIT_USDC) {
      setLocalMsg(`Minimum deposit is ${HL_MIN_DEPOSIT_USDC} USDC.`);
      return;
    }
    if (usd > usdcNum) {
      setLocalMsg(`Wallet has ${usdcNum.toFixed(2)} USDC — lower the amount or add funds.`);
      return;
    }

    setLocalMsg(null);
    try {
      const hash = await deposit(depositAmount);
      setLocalMsg(`Deposit sent — ${hash.slice(0, 10)}…`);
      onSuccess?.();
    } catch {
      /* error in hook */
    }
  };

  const handleWithdraw = async () => {
    if (!address) {
      open();
      return;
    }
    if (!amount.trim() || parseFloat(amount) <= 0) {
      setLocalMsg('Enter a valid withdrawal amount.');
      return;
    }
    setLocalMsg(null);
    try {
      await withdraw(amount, address as `0x${string}`);
      setLocalMsg('Withdrawal requested (~3–4 min)');
      onSuccess?.();
    } catch {
      /* error in hook */
    }
  };

  const primaryBusy = busy || switchBusy;

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
          </div>
        ) : null}

        {tab === 'deposit' && onArbitrum && isConnected ? (
          <div className="term-modal-card" style={{ marginBottom: 12 }}>
            <span className="term-modal-label">Wallet USDC (Arbitrum)</span>
            <strong className="term-modal-value">
              {balanceLoading ? '…' : `${usdcNum.toFixed(2)} USDC`}
            </strong>
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
        <div className="term-modal-input-row">
          <input
            className="term-profile-input"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setLocalMsg(null);
            }}
            placeholder={tab === 'deposit' ? String(HL_MIN_DEPOSIT_USDC) : '0'}
            inputMode="decimal"
          />
          {tab === 'deposit' ? (
            <button
              type="button"
              className="term-modal-link"
              onClick={handleMax}
              disabled={balanceLoading || !onArbitrum || usdcNum <= 0}
            >
              Max
            </button>
          ) : null}
        </div>

        {(error || localMsg) && (
          <p className={error ? 'term-profile-err' : 'term-profile-ok'}>{error || localMsg}</p>
        )}

        <button
          type="button"
          className="term-modal-primary"
          disabled={primaryBusy}
          onClick={() =>
            void (depositBlocked
              ? handleSwitchNetwork()
              : tab === 'deposit'
                ? handleDeposit()
                : handleWithdraw())
          }
        >
          {primaryBusy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : !isConnected ? (
            'Connect wallet'
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
