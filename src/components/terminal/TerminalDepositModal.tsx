import React, { useEffect, useState } from 'react';
import { ArrowDownLeft, Loader2, AlertCircle } from 'lucide-react';
import { formatUnits } from 'viem';
import { useWeb3 } from '../../contexts/Web3Context';
import { useTransactions } from '../../contexts/TransactionContext';
import {
  VaultClient,
  USDC_ADDRESSES,
  USDC_DECIMALS,
  VAULT_CHAIN_ID,
} from '../../lib/vault';
import { ERC20_ABI } from '../../lib/dex/router';
import { supabase } from '../../lib/supabase';
import TerminalModalFrame from './TerminalModalFrame';

const MIN_DEPOSIT_USD = 50;
const ARBISCAN = 'https://arbiscan.io';

type Props = {
  onClose: () => void;
  onSuccess: () => void;
};

const TerminalDepositModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const { chainId, address, publicClient, walletClient } = useWeb3();
  const { addTransaction, updateTransaction } = useTransactions();
  const [amount, setAmount] = useState('');
  const [usdcBalance, setUsdcBalance] = useState('0');
  const [ethBalance, setEthBalance] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onArbitrum = chainId === VAULT_CHAIN_ID;
  const depositUsd = parseFloat(amount || '0');
  const isBelowMinimum = depositUsd > 0 && depositUsd < MIN_DEPOSIT_USD;
  const MIN_ETH_FOR_GAS = 0.0001;
  const hasEnoughGas = parseFloat(ethBalance) >= MIN_ETH_FOR_GAS;
  const needsGas = !hasEnoughGas && !isLoadingBalance;

  useEffect(() => {
    const load = async () => {
      if (!address || !publicClient || chainId !== VAULT_CHAIN_ID) {
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
    load();
  }, [address, publicClient, chainId]);

  const handleMax = () => setAmount(usdcBalance);

  const handleDeposit = async () => {
    if (!address || !publicClient || !walletClient || chainId !== VAULT_CHAIN_ID) {
      setError('Connect on Arbitrum to deposit.');
      return;
    }
    if (!amount || depositUsd <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (depositUsd < MIN_DEPOSIT_USD) {
      setError(`Minimum deposit is $${MIN_DEPOSIT_USD} USDC.`);
      return;
    }
    if (depositUsd > parseFloat(usdcBalance)) {
      setError('Insufficient USDC in wallet.');
      return;
    }
    if (needsGas) {
      setError('Add a small amount of ETH on Arbitrum for gas (~$0.10).');
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
      const txHash = await vaultClient.deposit(amount, address as `0x${string}`);
      const txId = addTransaction({
        type: 'deposit',
        hash: txHash,
        status: 'confirming',
        description: `Depositing ${amount} USDC to vault`,
        amount: depositUsd.toFixed(2),
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
        const syncPayload = {
          wallet_address: walletLower,
          chain_id: VAULT_CHAIN_ID,
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

  const footer = (
    <button
      type="button"
      className="term-modal-primary"
      onClick={handleDeposit}
      disabled={
        isLoading ||
        !onArbitrum ||
        !amount ||
        depositUsd <= 0 ||
        isBelowMinimum ||
        needsGas
      }
    >
      {isLoading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Confirm in wallet…
        </>
      ) : (
        <>
          <ArrowDownLeft size={16} />
          Deposit USDC
        </>
      )}
    </button>
  );

  return (
    <TerminalModalFrame
      title="Deposit to vault"
      subtitle="Arbitrum · USDC · Vault V11"
      icon={<ArrowDownLeft size={18} className="text-[#16a34a]" />}
      onClose={onClose}
      closeDisabled={isLoading}
      footer={footer}
    >
      {!onArbitrum && (
        <p className="term-modal-note term-modal-note--warn">
          Switch to Arbitrum in the header before depositing.
        </p>
      )}

      <div className="term-modal-card">
        <span className="term-modal-label">Wallet USDC</span>
        <strong className="term-modal-value">
          {isLoadingBalance ? '…' : `${parseFloat(usdcBalance).toFixed(2)} USDC`}
        </strong>
      </div>

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
          disabled={isLoading}
          placeholder="0.00"
          step="0.01"
        />
        <button type="button" className="term-modal-link" onClick={handleMax} disabled={isLoadingBalance}>
          Max
        </button>
      </div>

      <p className="term-modal-hint">
        Minimum ${MIN_DEPOSIT_USD} USDC required for bot trading. Deposit fee: free.
      </p>

      {needsGas && (
        <div className="term-modal-alert">
          <AlertCircle size={16} />
          <span>Add ~$0.10 of ETH on Arbitrum for gas fees.</span>
        </div>
      )}
      {isBelowMinimum && (
        <div className="term-modal-alert term-modal-alert--warn">
          <AlertCircle size={16} />
          <span>Amount is below the ${MIN_DEPOSIT_USD} minimum.</span>
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
