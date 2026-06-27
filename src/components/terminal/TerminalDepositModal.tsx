import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, Loader2, AlertCircle, LogIn } from 'lucide-react';
import { formatUnits } from 'viem';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAuth } from '../../contexts/AuthContext';
import { useTransactions } from '../../contexts/TransactionContext';
import { linkWalletToUserSafe } from '../../lib/userWallets';
import {
  VaultClient,
  USDC_ADDRESSES,
  USDC_DECIMALS,
  VAULT_CHAIN_ID,
  PLATFORM_FEES,
} from '../../lib/vault';
import { MONADIER_VAULT_V11_TREASURY_ADDRESS } from '../../lib/monadierVault';
import { ERC20_ABI } from '../../lib/dex/router';
import { supabase } from '../../lib/supabase';
import TerminalModalFrame from './TerminalModalFrame';
import TerminalArbitrumBanner from './TerminalArbitrumBanner';

const MIN_DEPOSIT_USD = 50;
/** Soft hint — Arbitrum deposit is usually well below this; wallet enforces the real limit. */
const MIN_ETH_FOR_GAS = 0.00003;
const ARBISCAN = 'https://arbiscan.io';

type Props = {
  onClose: () => void;
  onSuccess: () => void;
  onRequireSignIn?: (reason: string) => void;
};

type Gate = 'connect' | 'network' | 'min' | 'balance' | null;

const TerminalDepositModal: React.FC<Props> = ({ onClose, onSuccess, onRequireSignIn }) => {
  const { open } = useMonadierAppKit();
  const { user, isDemoUser } = useAuth();
  const { chainId, address, publicClient, walletClient, switchChain } = useWeb3();
  const needsSignIn = !isDemoUser && !user;
  const { addTransaction, updateTransaction } = useTransactions();
  const [amount, setAmount] = useState('');
  const [usdcBalance, setUsdcBalance] = useState('0');
  const [ethBalance, setEthBalance] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const walletConnected = Boolean(address);
  const onArbitrum = chainId === VAULT_CHAIN_ID;
  const depositUsd = parseFloat(amount || '0');
  const usdcNum = parseFloat(usdcBalance) || 0;
  const ethNum = parseFloat(ethBalance) || 0;
  const isBelowMinimum = depositUsd > 0 && depositUsd < MIN_DEPOSIT_USD;
  const ethLow =
    onArbitrum && walletConnected && !isLoadingBalance && ethNum < MIN_ETH_FOR_GAS;

  useEffect(() => {
    const load = async () => {
      if (!address || !publicClient || chainId !== VAULT_CHAIN_ID) {
        setUsdcBalance('0');
        setEthBalance('0');
        setIsLoadingBalance(false);
        return;
      }
      try {
        setIsLoadingBalance(true);
        const usdcAddress = USDC_ADDRESSES[VAULT_CHAIN_ID];
        if (usdcAddress) {
          const balance = await publicClient.readContract({
            address: usdcAddress,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as `0x${string}`],
          });
          setUsdcBalance(formatUnits(balance as bigint, USDC_DECIMALS));
        }
        const ethBal = await publicClient.getBalance({ address: address as `0x${string}` });
        setEthBalance(formatUnits(ethBal, 18));
      } catch (err) {
        console.error('Balance load failed:', err);
      } finally {
        setIsLoadingBalance(false);
      }
    };
    void load();
  }, [address, publicClient, chainId]);

  const suggestedDeposit = useMemo(() => {
    if (usdcNum <= 0) return '';
    const capped = Math.min(usdcNum, usdcNum);
    if (capped < MIN_DEPOSIT_USD) return '';
    return capped.toFixed(2);
  }, [usdcNum]);

  const gate: Gate = useMemo(() => {
    if (!walletConnected) return 'connect';
    if (!onArbitrum) return 'network';
    if (isBelowMinimum) return 'min';
    if (depositUsd > 0 && depositUsd > usdcNum) return 'balance';
    return null;
  }, [walletConnected, onArbitrum, isBelowMinimum, depositUsd, usdcNum]);

  const handleMax = () => {
    if (usdcNum <= 0) return;
    setAmount(usdcNum.toFixed(2));
    setError(null);
  };

  const handleDeposit = async () => {
    if (needsSignIn) {
      onRequireSignIn?.('Sign in to link your wallet before depositing to the vault.');
      return;
    }
    if (!address || !publicClient) {
      setError('Connect your wallet on Arbitrum to deposit.');
      return;
    }
    if (!walletClient) {
      setError('Wallet not ready — open your wallet app or reconnect, then try again.');
      return;
    }
    if (chainId !== VAULT_CHAIN_ID) {
      setError('Switch to Arbitrum before depositing.');
      return;
    }

    let depositAmount = amount.trim();
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      if (suggestedDeposit) {
        depositAmount = suggestedDeposit;
        setAmount(suggestedDeposit);
      } else {
        setError('Enter a valid amount.');
        return;
      }
    }

    const usd = parseFloat(depositAmount);
    if (usd < MIN_DEPOSIT_USD) {
      setError(`Minimum deposit is $${MIN_DEPOSIT_USD} USDC.`);
      return;
    }
    if (usd > usdcNum) {
      setError('Insufficient USDC in wallet — fund your wallet first.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const vaultClient = new VaultClient(
        publicClient as never,
        walletClient as never,
        VAULT_CHAIN_ID
      );
      const txHash = await vaultClient.deposit(depositAmount, address as `0x${string}`);
      const txId = addTransaction({
        type: 'deposit',
        hash: txHash,
        status: 'confirming',
        description: `Depositing ${depositAmount} USDC to vault`,
        amount: usd.toFixed(2),
        token: 'USDC',
        chainId: VAULT_CHAIN_ID,
        blockExplorerUrl: `${ARBISCAN}/tx/${txHash}`,
      });
      onClose();
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      updateTransaction(txId, { status: 'success' });
      try {
        const vaultStatus = await vaultClient.getUserStatus(address as `0x${string}`);
        const walletLower = address.toLowerCase();
        const { data: existing } = await supabase
          .from('vault_settings')
          .select('id')
          .eq('wallet_address', walletLower)
          .eq('chain_id', VAULT_CHAIN_ID)
          .limit(1)
          .maybeSingle();
        if (user) {
          await linkWalletToUserSafe(user.id, address);
        }
        const syncPayload = {
          wallet_address: walletLower,
          chain_id: VAULT_CHAIN_ID,
          user_id: user?.id ?? null,
          auto_trade_enabled: vaultStatus.autoTradeEnabled,
          risk_level_bps: vaultStatus.riskLevelBps,
          updated_at: new Date().toISOString(),
          synced_at: new Date().toISOString(),
        };
        if (existing) {
          await supabase
            .from('vault_settings')
            .update(syncPayload)
            .eq('wallet_address', walletLower)
            .eq('chain_id', VAULT_CHAIN_ID);
        } else {
          await supabase.from('vault_settings').insert(syncPayload);
        }
      } catch (syncErr) {
        console.warn('Vault settings sync after deposit:', syncErr);
      }
      onSuccess();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err && 'shortMessage' in err
            ? String((err as { shortMessage: string }).shortMessage)
            : 'Deposit failed';
      if (msg.includes('User rejected') || msg.includes('denied')) {
        setError('Transaction cancelled.');
      } else if (msg.includes('insufficient funds') || msg.includes('gas')) {
        setError('Not enough ETH for gas on Arbitrum.');
      } else {
        setError(msg);
      }
      setIsLoading(false);
    }
  };

  const primaryLabel =
    gate === 'connect'
      ? 'Connect wallet'
      : gate === 'network'
        ? 'Switch to Arbitrum'
        : 'Deposit USDC';

  const primaryAction = async () => {
    if (gate === 'connect') {
      open();
      return;
    }
    if (gate === 'network') {
      try {
        await switchChain(VAULT_CHAIN_ID);
      } catch {
        setError('Could not switch network — approve in your wallet.');
      }
      return;
    }
    await handleDeposit();
  };

  const footer = (
    <button
      type="button"
      className="term-modal-primary"
      onClick={() => void primaryAction()}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Confirm in wallet…
        </>
      ) : (
        <>
          <ArrowDownLeft size={16} />
          {primaryLabel}
        </>
      )}
    </button>
  );

  if (needsSignIn) {
    return (
      <TerminalModalFrame
        title="Sign in required"
        subtitle="Vault deposit · Monadier account"
        icon={<LogIn size={18} className="text-[#16a34a]" />}
        onClose={onClose}
        footer={
          <button
            type="button"
            className="term-modal-primary"
            onClick={() =>
              onRequireSignIn?.(
                'Sign in to link your wallet before depositing — vault funds stay in your wallet on Arbitrum.'
              )
            }
          >
            <LogIn size={16} />
            Sign in to deposit
          </button>
        }
      >
        <div className="term-modal-alert">
          <AlertCircle size={16} />
          <span>
            Vault deposits must be linked to your Monadier account so the bot can trade and you can
            track your funds. Your USDC stays in a smart-contract vault controlled by your wallet —
            we never hold your private keys.
          </span>
        </div>
      </TerminalModalFrame>
    );
  }

  return (
    <TerminalModalFrame
      title="Deposit to vault"
      subtitle="Arbitrum · USDC · Vault V11"
      icon={<ArrowDownLeft size={18} className="text-[#16a34a]" />}
      onClose={onClose}
      closeDisabled={isLoading}
      footer={footer}
    >
      {!walletConnected && (
        <div className="term-modal-alert">
          <AlertCircle size={16} />
          <span>Connect your wallet to deposit USDC from it into the vault.</span>
        </div>
      )}

      {walletConnected && !onArbitrum && <TerminalArbitrumBanner variant="inline" />}

      {walletConnected && onArbitrum && (
        <div className="term-modal-card">
          <span className="term-modal-label">Wallet on Arbitrum</span>
          <strong className="term-modal-value">
            {isLoadingBalance ? '…' : `${usdcNum.toFixed(2)} USDC`}
          </strong>
          <p className="term-modal-hint" style={{ marginTop: 6 }}>
            {isLoadingBalance
              ? 'Loading balances…'
              : `ETH for gas: ${ethNum.toFixed(6)} ETH`}
          </p>
          {!isLoadingBalance && usdcNum < MIN_DEPOSIT_USD && (
            <p className="term-modal-hint">
              You need at least ${MIN_DEPOSIT_USD} USDC in your wallet on Arbitrum.
            </p>
          )}
        </div>
      )}

      <label className="term-modal-label" htmlFor="term-deposit-amt">
        Amount
      </label>
      <div className="term-modal-input-row">
        <input
          id="term-deposit-amt"
          type="number"
          className="term-modal-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={isLoading || !walletConnected}
          placeholder="0.00"
          step="0.01"
        />
        <button
          type="button"
          className="term-modal-link"
          onClick={handleMax}
          disabled={isLoadingBalance || !onArbitrum || !walletConnected}
        >
          Max
        </button>
      </div>

      <p className="term-modal-hint">
        Minimum ${MIN_DEPOSIT_USD} USDC credited to vault. On-chain deposit fee{' '}
        {PLATFORM_FEES.BASE_FEE_BPS / 100}% goes to the platform treasury (
        {MONADIER_VAULT_V11_TREASURY_ADDRESS.slice(0, 6)}…
        {MONADIER_VAULT_V11_TREASURY_ADDRESS.slice(-4)}) — not your vault balance. Example: deposit
        52 USDC → ~51.95 USDC in vault, ~0.05 USDC fee. You need ETH on Arbitrum for gas.
      </p>

      {ethLow && (
        <div className="term-modal-alert term-modal-alert--warn">
          <AlertCircle size={16} />
          <span>
            USDC looks good ({usdcNum.toFixed(2)} available). Send a little ETH to this wallet on
            Arbitrum for gas (~0.0001 ETH), then tap Deposit — your wallet will ask you to confirm.
          </span>
        </div>
      )}
      {gate === 'min' && (
        <div className="term-modal-alert term-modal-alert--warn">
          <AlertCircle size={16} />
          <span>Amount is below the ${MIN_DEPOSIT_USD} minimum.</span>
        </div>
      )}
      {gate === 'balance' && (
        <div className="term-modal-alert term-modal-alert--warn">
          <AlertCircle size={16} />
          <span>
            Your wallet has {usdcNum.toFixed(2)} USDC — add more USDC on Arbitrum or lower the amount.
          </span>
        </div>
      )}
      {error && (
        <div className="term-modal-alert term-modal-alert--err">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
    </TerminalModalFrame>
  );
};

export default TerminalDepositModal;
