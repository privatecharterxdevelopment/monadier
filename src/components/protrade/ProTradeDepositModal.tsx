import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { formatUnits } from 'viem';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useChainId, useSwitchChain } from 'wagmi';
import { arbitrum } from 'viem/chains';
import { useWeb3 } from '../../contexts/Web3Context';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { HL_ARBITRUM_CHAIN_ID } from '../../lib/hyperliquid/bridge';
import { HL_MIN_DEPOSIT_USDC } from '../../lib/hyperliquid/hlApp';
import { MIN_HL_BOT_USD } from '../../lib/hyperliquid/hlBotAgent';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { USDC_ADDRESSES, USDC_DECIMALS } from '../../lib/vault';
import { ERC20_ABI } from '../../lib/dex/router';

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
  withdrawable?: string;
  hlBalanceUsd?: number;
  initialTab?: 'deposit' | 'withdraw';
  /** Betting uses Spot USDC; perps/bot use account value. */
  mode?: 'perps' | 'betting';
};

const ProTradeDepositModal: React.FC<Props> = ({
  onClose,
  onSuccess,
  withdrawable,
  hlBalanceUsd = 0,
  initialTab = 'deposit',
  mode = 'perps',
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
        const usdcAddress = USDC_ADDRESSES[HL_ARBITRUM_CHAIN_ID];
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
      setLocalMsg('Network switch cancelled — approve in your wallet.');
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
      setLocalMsg('Wallet not ready — unlock your wallet and try again.');
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
      setLocalMsg(`Wallet has ${usdcNum.toFixed(2)} USDC on Arbitrum — lower the amount.`);
      return;
    }

    setLocalMsg(null);
    try {
      const hash = await deposit(depositAmount);
      setLocalMsg(`Sent — ${hash.slice(0, 10)}… Credits on Hyperliquid in ~1 min.`);
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
      setLocalMsg('Enter a valid amount.');
      return;
    }
    if (!walletReady) {
      setLocalMsg('Connect wallet and try again.');
      return;
    }
    setLocalMsg(null);
    try {
      await withdraw(amount, address as `0x${string}`);
      setLocalMsg('Withdrawal requested — usually arrives in a few minutes.');
      onSuccess?.();
    } catch {
      /* error in hook */
    }
  };

  const primaryBusy = busy || switchBusy;
  const isBetting = mode === 'betting';

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
            {isBetting ? 'Betting balance' : 'Hyperliquid funds'}
          </h2>
          <button type="button" className="hl-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

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

        <div className="term-panel-card term-panel-card--muted hl-funds-balance">
          <span className="term-panel-card-label">
            {isBetting ? 'Spot USDC (betting)' : 'HL balance (bot capital)'}
          </span>
          <strong className="term-panel-card-value">{fmtUsdSymbol(String(hlBalanceUsd))}</strong>
          <span className="term-panel-card-hint">
            {isBetting
              ? `Withdrawable ${fmtUsdSymbol(withdrawable)} · min $10 to place a bet`
              : `Withdrawable ${fmtUsdSymbol(withdrawable)} · min $${MIN_HL_BOT_USD} to run the bot`}
          </span>
        </div>

        <p className="hl-entry-hint hl-funds-trust">
          Your funds are not locked by Monadier. Only your wallet can withdraw from Hyperliquid — the
          trading agent cannot move USDC out.
        </p>

        {tab === 'deposit' ? (
          <>
            <p className="hl-entry-hint hl-funds-lead">
              Deposit <strong>in Monadier</strong> — your wallet sends USDC to Hyperliquid
              {isBetting ? ' Spot' : ''}. No need to open hyperliquid.xyz.
            </p>

            {!onArbitrum ? (
              <div className="term-arb-gate term-arb-gate--inline" style={{ marginBottom: 12 }}>
                <p className="term-hint">
                  One-time switch to <strong>{arbitrum.name}</strong> to move USDC into your HL
                  account (~1 min credit).
                </p>
                <button
                  type="button"
                  className="term-btn-sm w-full justify-center"
                  disabled={switchBusy}
                  onClick={() => void handleSwitchNetwork()}
                >
                  {switchBusy ? <Loader2 size={14} className="animate-spin" /> : 'Switch to Arbitrum'}
                </button>
              </div>
            ) : isConnected ? (
              <div className="term-modal-card" style={{ marginBottom: 12 }}>
                <span className="term-modal-label">Your USDC on Arbitrum</span>
                <strong className="term-modal-value">
                  {balanceLoading ? '…' : `${usdcNum.toFixed(2)} USDC`}
                </strong>
              </div>
            ) : null}

            <label className="term-profile-label">Amount (USDC)</label>
            <div className="term-modal-input-row">
              <input
                className="term-profile-input"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setLocalMsg(null);
                }}
                placeholder={String(HL_MIN_DEPOSIT_USDC)}
                inputMode="decimal"
                disabled={!onArbitrum}
              />
              <button
                type="button"
                className="term-modal-link"
                onClick={handleMax}
                disabled={balanceLoading || !onArbitrum || usdcNum <= 0}
              >
                Max
              </button>
            </div>

            <p className="hl-entry-hint">
              Min {HL_MIN_DEPOSIT_USDC} USDC. Need USDC on Arbitrum — withdraw from an exchange to
              Arbitrum if your funds are elsewhere.
            </p>

            <button
              type="button"
              className="term-modal-primary"
              disabled={primaryBusy}
              onClick={() =>
                void (!isConnected ? open() : !onArbitrum ? handleSwitchNetwork() : handleDeposit())
              }
            >
              {primaryBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : !isConnected ? (
                'Connect wallet'
              ) : !onArbitrum ? (
                'Switch to Arbitrum'
              ) : (
                'Deposit to Hyperliquid'
              )}
            </button>

            <button
              type="button"
              className="term-btn-sm term-btn-sm--ghost w-full justify-center"
              onClick={() => {
                onSuccess?.();
                setLocalMsg('Refreshing HL balance…');
              }}
            >
              <RefreshCw size={14} />
              Refresh HL balance
            </button>
          </>
        ) : (
          <>
            <p className="hl-entry-hint">
              Withdraw to your Arbitrum wallet. Signed by you only — the bot cannot withdraw on your
              behalf. Open positions may reduce the amount available to withdraw.
            </p>
            <p className="hl-entry-hint">
              Available: <strong>{fmtUsdSymbol(withdrawable)}</strong>
            </p>
            <label className="term-profile-label">Amount (USDC)</label>
            <input
              className="term-profile-input"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setLocalMsg(null);
              }}
              placeholder="0"
              inputMode="decimal"
            />
            <button
              type="button"
              className="term-modal-primary"
              disabled={primaryBusy}
              onClick={() => void handleWithdraw()}
            >
              {primaryBusy ? <Loader2 size={16} className="animate-spin" /> : 'Withdraw from HL'}
            </button>
          </>
        )}

        {(error || localMsg) && (
          <p className={error ? 'term-profile-err' : 'term-profile-ok'}>{error || localMsg}</p>
        )}
      </div>
    </div>
  );
};

export default ProTradeDepositModal;
