import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { formatUnits } from 'viem';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useChainId, useSwitchChain } from 'wagmi';
import { arbitrum } from 'viem/chains';
import { useWeb3 } from '../../contexts/Web3Context';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { HL_ARBITRUM_CHAIN_ID } from '../../lib/hyperliquid/bridge';
import { HL_APP_URL, HL_MIN_DEPOSIT_USDC } from '../../lib/hyperliquid/hlApp';
import { MIN_HL_BOT_USD } from '../../lib/hyperliquid/hlBotAgent';
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
  const [showArbBridge, setShowArbBridge] = useState(false);

  const onArbitrum = chainId === HL_ARBITRUM_CHAIN_ID;
  const usdcNum = parseFloat(usdcBalance) || 0;

  const suggestedDeposit = useMemo(() => {
    if (usdcNum < HL_MIN_DEPOSIT_USDC) return '';
    return usdcNum.toFixed(2);
  }, [usdcNum]);

  useEffect(() => {
    const load = async () => {
      if (!address || !publicClient || !onArbitrum || !showArbBridge) {
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
  }, [address, publicClient, onArbitrum, showArbBridge]);

  const handleSwitchNetwork = async () => {
    try {
      setSwitchBusy(true);
      setLocalMsg(null);
      await switchChainAsync({ chainId: HL_ARBITRUM_CHAIN_ID });
    } catch {
      setLocalMsg('Netzwerkwechsel abgebrochen — in der Wallet bestätigen.');
    } finally {
      setSwitchBusy(false);
    }
  };

  const handleMax = () => {
    if (usdcNum <= 0) return;
    setAmount(usdcNum.toFixed(2));
    setLocalMsg(null);
  };

  const handleArbDeposit = async () => {
    if (!isConnected || !address) {
      open();
      return;
    }
    if (!onArbitrum) {
      await handleSwitchNetwork();
      return;
    }
    if (!walletClient || !walletReady) {
      setLocalMsg('Wallet nicht bereit — Wallet öffnen und erneut versuchen.');
      return;
    }

    let depositAmount = amount.trim();
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      if (suggestedDeposit) {
        depositAmount = suggestedDeposit;
        setAmount(suggestedDeposit);
      } else {
        setLocalMsg(`Mindestens ${HL_MIN_DEPOSIT_USDC} USDC eingeben.`);
        return;
      }
    }

    const usd = parseFloat(depositAmount);
    if (usd < HL_MIN_DEPOSIT_USDC) {
      setLocalMsg(`Mindestens ${HL_MIN_DEPOSIT_USDC} USDC.`);
      return;
    }
    if (usd > usdcNum) {
      setLocalMsg(`Nur ${usdcNum.toFixed(2)} USDC in der Wallet.`);
      return;
    }

    setLocalMsg(null);
    try {
      const hash = await deposit(depositAmount);
      setLocalMsg(`Gesendet — ${hash.slice(0, 10)}… Gutschrift auf HL in ~1 Min.`);
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
      setLocalMsg('Betrag eingeben.');
      return;
    }
    setLocalMsg(null);
    try {
      await withdraw(amount, address as `0x${string}`);
      setLocalMsg('Auszahlung angefordert (~3–4 Min.)');
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
            Hyperliquid Guthaben
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
            Einzahlen
          </button>
          <button
            type="button"
            className={tab === 'withdraw' ? 'term-pro-funds-tab--on' : ''}
            onClick={() => setTab('withdraw')}
          >
            Auszahlen
          </button>
        </div>

        {tab === 'deposit' ? (
          <>
            <p className="hl-entry-hint" style={{ marginBottom: 12 }}>
              Bot-Kapital liegt auf <strong>Hyperliquid</strong> (USDC). Nicht Arbitrum, nicht Vault —
              nur dein HL-Konto.
            </p>
            <ol className="hl-deposit-steps">
              <li>
                <strong>Gleiche Wallet</strong> wie in Monadier auf{' '}
                <a href={HL_APP_URL} target="_blank" rel="noopener noreferrer">
                  app.hyperliquid.xyz
                </a>{' '}
                verbinden.
              </li>
              <li>
                <strong>Deposit</strong> klicken → USDC von deiner Chain (Ethereum, Base, Arbitrum, …)
                auf Hyperliquid senden. Min. {HL_MIN_DEPOSIT_USDC} USDC (HL-Regel).
              </li>
              <li>
                Min. <strong>${MIN_HL_BOT_USD}</strong> auf HL für den Bot. Dann hier{' '}
                <strong>Start bot</strong>.
              </li>
            </ol>
            {address ? (
              <p className="hl-entry-hint hl-deposit-wallet">
                Deine Wallet: <code>{address.slice(0, 6)}…{address.slice(-4)}</code>
              </p>
            ) : null}
            <a
              className="term-modal-primary hl-deposit-open"
              href={HL_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} />
              Auf Hyperliquid einzahlen
            </a>
            <button
              type="button"
              className="term-btn-sm term-btn-sm--ghost w-full justify-center"
              onClick={() => {
                onSuccess?.();
                setLocalMsg('Balance wird aktualisiert…');
              }}
            >
              <RefreshCw size={14} />
              Eingezahlt — Balance aktualisieren
            </button>

            <details
              className="hl-deposit-advanced"
              open={showArbBridge}
              onToggle={(e) => setShowArbBridge((e.target as HTMLDetailsElement).open)}
            >
              <summary>Optional: USDC von Arbitrum (in-app)</summary>
              <p className="hl-entry-hint">
                Nur wenn du bereits USDC auf Arbitrum hast. Sonst lieber direkt über Hyperliquid
                einzahlen.
              </p>
              {!onArbitrum ? (
                <button
                  type="button"
                  className="term-btn-sm w-full justify-center"
                  disabled={switchBusy}
                  onClick={() => void handleSwitchNetwork()}
                >
                  Zu Arbitrum wechseln
                </button>
              ) : isConnected ? (
                <div className="term-modal-card" style={{ marginBottom: 8 }}>
                  <span className="term-modal-label">USDC Arbitrum</span>
                  <strong className="term-modal-value">
                    {balanceLoading ? '…' : `${usdcNum.toFixed(2)} USDC`}
                  </strong>
                </div>
              ) : null}
              <label className="term-profile-label">Betrag (USDC)</label>
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
              <button
                type="button"
                className="term-btn-sm w-full justify-center"
                disabled={primaryBusy || !onArbitrum}
                onClick={() => void handleArbDeposit()}
              >
                {primaryBusy ? <Loader2 size={16} className="animate-spin" /> : 'Von Arbitrum senden'}
              </button>
            </details>
          </>
        ) : (
          <>
            <p className="hl-entry-hint">
              Auszahlung von Hyperliquid auf deine Wallet ({arbitrum.name} oder per HL-UI). Verfügbar:{' '}
              {fmtUsdSymbol(withdrawable)}
            </p>
            <label className="term-profile-label">Betrag (USDC)</label>
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
              {primaryBusy ? <Loader2 size={16} className="animate-spin" /> : 'Von HL auszahlen'}
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
