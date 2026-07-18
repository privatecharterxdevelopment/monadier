import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { formatUnits } from 'viem';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useChainId, useSwitchChain } from 'wagmi';
import { useWeb3 } from '../../contexts/Web3Context';
import HlArbitrumUsdcCallout from './HlArbitrumUsdcCallout';
import HlDepositFlowOverlay, { type HlDepositFlowState } from './HlDepositFlowOverlay';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { HL_ARBITRUM_CHAIN_ID } from '../../lib/hyperliquid/bridge';
import { HL_MIN_DEPOSIT_USDC } from '../../lib/hyperliquid/hlApp';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import {
  describeHlFundsPlacement,
  fetchHlFundingSnapshot,
  pollHlFundingAfterDeposit,
  spotToPerpTransferAmount,
} from '../../lib/hyperliquid/funding';
import { USDC_ADDRESSES, USDC_DECIMALS } from '../../lib/usdcArbitrum';
import { ERC20_ABI } from '../../lib/dex/router';
import { useProTradeThemeOptional } from '../../contexts/ProTradeThemeContext';
import { useWithdrawFeeGate } from '../../hooks/useWithdrawFeeGate';

const ARBITRUM_USDC_E = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' as const;

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
  withdrawable?: string;
  hlBalanceUsd?: number;
  spotUsdc?: number;
  initialTab?: 'deposit' | 'withdraw';
  onTransfer?: () => void;
};

const ProTradeDepositModal: React.FC<Props> = ({
  onClose,
  onSuccess,
  withdrawable,
  hlBalanceUsd = 0,
  spotUsdc = 0,
  initialTab = 'deposit',
  onTransfer,
}) => {
  const { open } = useMonadierAppKit();
  const {
    withdrawBlocked,
    platformWithdrawBlocked,
    bettingWithdrawBlocked,
    platformAccruedUsd,
    bettingAccruedUsd,
    openPlatformPayModal,
    openBettingPayModal,
  } = useWithdrawFeeGate();
  const { address, isConnected } = useMonadierWallet();
  const { publicClient, walletClient } = useWeb3();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { deposit, withdraw, busy, error, walletReady, transferUsdClass } = useHyperliquidTrading();
  const [tab, setTab] = useState<'deposit' | 'withdraw'>(initialTab);
  const [amount, setAmount] = useState('');
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState('0');
  const [usdceBalance, setUsdceBalance] = useState('0');
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [depositFlow, setDepositFlow] = useState<HlDepositFlowState>({ phase: 'idle' });
  const [liveFunding, setLiveFunding] = useState<HlFundingSnapshot | null>(null);

  const onArbitrum = chainId === HL_ARBITRUM_CHAIN_ID;
  const usdcNum = parseFloat(usdcBalance) || 0;
  const usdceNum = parseFloat(usdceBalance) || 0;

  const perpUsd = liveFunding?.tradablePerpUsd ?? liveFunding?.perpUsd ?? hlBalanceUsd;
  const spotUsd = liveFunding?.spotUsdcUsd ?? spotUsdc;
  const unifiedAccount = liveFunding?.unifiedAccount ?? false;
  const totalHlUsd = liveFunding?.totalUsd ?? Math.max(perpUsd, spotUsd);
  const fundsPlacementHint = describeHlFundsPlacement(
    liveFunding ?? {
      perpUsd,
      spotUsdcUsd: spotUsd,
      withdrawableUsd: toNum(withdrawable),
      totalUsd: perpUsd + spotUsd,
      stateLoaded: true,
    }
  );

  const suggestedDeposit = useMemo(() => {
    if (usdcNum < HL_MIN_DEPOSIT_USDC) return '';
    return usdcNum.toFixed(2);
  }, [usdcNum]);

  useEffect(() => {
    const load = async () => {
      if (!address || !publicClient || !onArbitrum) {
        setUsdcBalance('0');
        setUsdceBalance('0');
        setBalanceLoading(false);
        return;
      }
      try {
        setBalanceLoading(true);
        const usdcAddress = USDC_ADDRESSES[HL_ARBITRUM_CHAIN_ID];
        if (!usdcAddress) {
          setUsdcBalance('0');
          setUsdceBalance('0');
          return;
        }
        const [nativeBal, bridgedBal] = await Promise.all([
          publicClient.readContract({
            address: usdcAddress,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as `0x${string}`],
          }),
          publicClient.readContract({
            address: ARBITRUM_USDC_E,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as `0x${string}`],
          }),
        ]);
        setUsdcBalance(formatUnits(nativeBal as bigint, USDC_DECIMALS));
        setUsdceBalance(formatUnits(bridgedBal as bigint, USDC_DECIMALS));
      } catch {
        setUsdcBalance('0');
      } finally {
        setBalanceLoading(false);
      }
    };
    void load();
  }, [address, publicClient, onArbitrum]);

  useEffect(() => {
    if (!address) {
      setLiveFunding(null);
      return;
    }
    void fetchHlFundingSnapshot(address).then(setLiveFunding);
  }, [address, hlBalanceUsd, spotUsdc]);

  const refreshHlFunding = async () => {
    if (!address) return;
    setRefreshBusy(true);
    try {
      const snap = await fetchHlFundingSnapshot(address);
      setLiveFunding(snap);
      onSuccess?.();
      setLocalMsg(
        snap.stateLoaded
          ? `HL total ${fmtUsdSymbol(snap.totalUsd)} (Perps ${fmtUsdSymbol(snap.perpUsd)} · Spot ${fmtUsdSymbol(snap.spotUsdcUsd)})`
          : 'Could not read Hyperliquid balance — try again in a moment.'
      );
    } finally {
      setRefreshBusy(false);
    }
  };

  const startDepositPolling = async (
    baselineUsd: number,
    depositedUsd: number,
    txHash: string
  ): Promise<HlFundingSnapshot | null> => {
    if (!address) return null;
    const snap = await pollHlFundingAfterDeposit(
      address,
      (next) => {
        setLiveFunding(next);
        onSuccess?.();
      },
      {
        baselineUsd,
        minIncreaseUsd: Math.max(1, depositedUsd * 0.25),
        attempts: 24,
        intervalMs: 5000,
      }
    );
    let finalSnap = snap;

    if (
      !snap.unifiedAccount &&
      walletReady &&
      snap.spotUsdcUsd >= 1 &&
      snap.tradablePerpUsd < Math.max(1, depositedUsd * 0.25)
    ) {
      const move = spotToPerpTransferAmount(snap.spotUsdcUsd);
      if (move) {
        try {
          setDepositFlow({ phase: 'bridging', txHash, amountUsd: depositedUsd });
          setLocalMsg('Moving USDC to Perps for trading…');
          await transferUsdClass(move, true);
          finalSnap = await fetchHlFundingSnapshot(address);
          setLiveFunding(finalSnap);
          onSuccess?.();
        } catch {
          setDepositFlow({
            phase: 'delayed',
            txHash,
            amountUsd: depositedUsd,
            totalUsd: snap.totalUsd,
          });
          setLocalMsg(
            `${snap.spotUsdcUsd.toFixed(2)} USDC credited on HL Spot — use Transfer Spot → Perps in Funds.`
          );
          return snap;
        }
      }
    }

    const credited =
      finalSnap.tradablePerpUsd >= Math.max(1, depositedUsd * 0.25) ||
      finalSnap.totalUsd >= baselineUsd + Math.max(1, depositedUsd * 0.25);
    if (credited && finalSnap.tradablePerpUsd >= 1) {
      setDepositFlow({
        phase: 'success',
        txHash,
        amountUsd: depositedUsd,
        totalUsd: finalSnap.totalUsd,
      });
    } else if (credited) {
      setDepositFlow({
        phase: 'delayed',
        txHash,
        amountUsd: depositedUsd,
        totalUsd: finalSnap.totalUsd,
      });
      setLocalMsg(
        `USDC on HL Spot (${fmtUsdSymbol(finalSnap.spotUsdcUsd)}) — transfer to Perps to trade.`
      );
    } else {
      setDepositFlow({
        phase: 'delayed',
        txHash,
        amountUsd: depositedUsd,
        totalUsd: finalSnap.totalUsd,
      });
    }
    return finalSnap;
  };

  const resetDepositFlow = () => setDepositFlow({ phase: 'idle' });

  const handleDelayedRefresh = async () => {
    if (depositFlow.phase !== 'delayed') return;
    const { txHash, amountUsd, totalUsd: prevTotal } = depositFlow;
    const baseline = Math.max(0, prevTotal - amountUsd);
    await refreshHlFunding();
    const snap = await fetchHlFundingSnapshot(address!);
    setLiveFunding(snap);
    if (snap.totalUsd >= baseline + Math.max(1, amountUsd * 0.25)) {
      setDepositFlow({
        phase: 'success',
        txHash,
        amountUsd,
        totalUsd: snap.totalUsd,
      });
    }
  };

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
      if (usdceNum > 0 && usdcNum <= 0) {
        setLocalMsg(
          `You have ${usdceNum.toFixed(2)} USDC.e (bridged) — Hyperliquid needs native USDC on Arbitrum. Swap USDC.e → USDC first.`
        );
        return;
      }
      setLocalMsg(`Wallet has ${usdcNum.toFixed(2)} USDC on Arbitrum — lower the amount.`);
      return;
    }

    const baselineUsd = totalHlUsd;
    setLocalMsg(null);
    setDepositFlow({ phase: 'signing' });
    try {
      const hash = await deposit(depositAmount);
      setDepositFlow({ phase: 'bridging', txHash: hash, amountUsd: usd });
      onSuccess?.();

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        if (receipt.status === 'reverted') {
          setDepositFlow({
            phase: 'error',
            message:
              'The Arbitrum transaction reverted — USDC was not sent to the Hyperliquid bridge.',
            txHash: hash,
          });
          return;
        }
      }

      await startDepositPolling(baselineUsd, usd, hash);
    } catch (err: unknown) {
      const msg =
        (err instanceof Error ? err.message : null) ||
        'Deposit was rejected or failed before reaching Hyperliquid.';
      setDepositFlow({ phase: 'error', message: msg });
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

  const depositFlowActive = depositFlow.phase !== 'idle';
  const primaryBusy =
    busy ||
    switchBusy ||
    refreshBusy ||
    depositFlow.phase === 'signing' ||
    depositFlow.phase === 'bridging';
  const theme = useProTradeThemeOptional();

  const modal = (
    <div
      className={`hl-root hl-root--${theme} hl-modal-backdrop hl-modal-backdrop--funds`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`hl-modal hl-modal--sm hl-modal--funds-compact${depositFlowActive ? ' hl-modal--deposit-flow' : ''}`}
        role="dialog"
        aria-labelledby="pro-funds-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hl-modal-head hl-modal-head--compact">
          <h2 id="pro-funds-title" className="hl-modal-title">
            Hyperliquid · USDC
          </h2>
          <button type="button" className="hl-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="term-pro-funds-tabs term-pro-funds-tabs--compact">
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

        <div className={`hl-funds-body${depositFlowActive ? ' hl-funds-body--flow' : ''}`}>
          <HlDepositFlowOverlay
            flow={depositFlow}
            walletAddress={address}
            onDismiss={resetDepositFlow}
            onRetryRefresh={() => void handleDelayedRefresh()}
            refreshBusy={refreshBusy}
          />

          <div className={depositFlowActive ? 'hl-funds-content hl-funds-content--dimmed' : 'hl-funds-content'}>
            <div className="hl-funds-summary">
              <div className="hl-funds-summary__row">
                <span>On Hyperliquid</span>
                <strong>{fmtUsdSymbol(totalHlUsd)}</strong>
              </div>
              {!unifiedAccount ? (
                <div className="hl-funds-summary__sub">
                  Perps {fmtUsdSymbol(perpUsd)} · Spot {fmtUsdSymbol(spotUsd)}
                </div>
              ) : null}
              <div className="hl-funds-summary__sub">
                Withdrawable {fmtUsdSymbol(withdrawable)} · perps, bot &amp; betting
              </div>
            </div>

            {fundsPlacementHint && tab === 'deposit' ? (
              <div className="hl-funds-placement-hint hl-funds-placement-hint--compact">
                <p>{fundsPlacementHint}</p>
                {onTransfer ? (
                  <button type="button" className="term-btn-sm" onClick={onTransfer}>
                    Spot → Perps
                  </button>
                ) : null}
              </div>
            ) : null}

            {usdceNum > 0 && usdcNum <= 0 && tab === 'deposit' ? (
              <p className="term-profile-err hl-funds-inline-err">
                {usdceNum.toFixed(2)} USDC.e — swap to native USDC first.
              </p>
            ) : null}

            {tab === 'deposit' ? (
              <>
                <HlArbitrumUsdcCallout
                  compact
                  onArbitrum={onArbitrum}
                  chainId={chainId}
                  switchBusy={switchBusy}
                  onSwitch={handleSwitchNetwork}
                  usdcBalance={usdcNum}
                  balanceLoading={balanceLoading}
                  showBalance={isConnected}
                  walletAddress={address}
                />

                <label className="term-profile-label hl-funds-amount-label">Amount (USDC)</label>
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

                <button
                  type="button"
                  className="term-modal-primary hl-funds-primary"
                  disabled={primaryBusy}
                  onClick={() =>
                    void (
                      !isConnected
                        ? open()
                        : !onArbitrum
                          ? handleSwitchNetwork()
                          : handleDeposit()
                    )
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
                  className="hl-funds-refresh-link"
                  disabled={refreshBusy || depositFlowActive}
                  onClick={() => void refreshHlFunding()}
                >
                  <RefreshCw size={12} className={refreshBusy ? 'animate-spin' : undefined} />
                  Refresh balance
                </button>
              </>
            ) : (
              <>
                <p className="hl-funds-withdraw-hint">
                  To your Arbitrum wallet · available{' '}
                  <strong>{fmtUsdSymbol(withdrawable)}</strong>
                </p>
                {withdrawBlocked ? (
                  <p className="term-profile-err hl-funds-inline-err">
                    {platformWithdrawBlocked ? (
                      <>
                        Bot fees due ({fmtUsdSymbol(platformAccruedUsd)}) —{' '}
                        <button type="button" className="hl-fee-inline-pay" onClick={openPlatformPayModal}>
                          Pay bot fees
                        </button>
                        {bettingWithdrawBlocked ? ' · ' : ' '}
                      </>
                    ) : null}
                    {bettingWithdrawBlocked ? (
                      <>
                        Betting fees due ({fmtUsdSymbol(bettingAccruedUsd)}) —{' '}
                        <button type="button" className="hl-fee-inline-pay" onClick={openBettingPayModal}>
                          Pay betting fees
                        </button>{' '}
                      </>
                    ) : null}
                    Pay on-chain to unlock withdrawal in Monadier.
                  </p>
                ) : null}
                <label className="term-profile-label hl-funds-amount-label">Amount (USDC)</label>
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
                  className="term-modal-primary hl-funds-primary"
                  disabled={primaryBusy || withdrawBlocked}
                  onClick={() => void handleWithdraw()}
                >
                  {primaryBusy ? <Loader2 size={16} className="animate-spin" /> : 'Withdraw from HL'}
                </button>
              </>
            )}

            {(error || localMsg) && !depositFlowActive ? (
              <p className={error ? 'term-profile-err hl-funds-inline-err' : 'term-profile-ok hl-funds-inline-err'}>
                {error || localMsg}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modal;

  return createPortal(modal, document.body);
};

export default ProTradeDepositModal;
