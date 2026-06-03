import React, { useState } from 'react';
import { ArrowUpRight, Loader2, AlertCircle } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useTransactions } from '../../contexts/TransactionContext';
import { VaultClient, VAULT_CHAIN_ID } from '../../lib/vault';
import TerminalModalFrame from './TerminalModalFrame';

const ARBISCAN = 'https://arbiscan.io';

type Props = {
  maxAmount: string;
  onClose: () => void;
  onSuccess: () => void;
};

const TerminalWithdrawModal: React.FC<Props> = ({ maxAmount, onClose, onSuccess }) => {
  const { chainId, address, publicClient, walletClient } = useWeb3();
  const { addTransaction, updateTransaction } = useTransactions();
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onArbitrum = chainId === VAULT_CHAIN_ID;
  const maxNum = parseFloat(maxAmount) || 0;

  const runWithdraw = async (withdrawAmount: string, withdrawAll: boolean) => {
    if (!address || !publicClient || !walletClient || chainId !== VAULT_CHAIN_ID) {
      setError('Connect on Arbitrum to withdraw.');
      return;
    }
    const amt = parseFloat(withdrawAmount);
    if (!withdrawAll && (!withdrawAmount || amt <= 0)) {
      setError('Enter a valid amount.');
      return;
    }
    if (!withdrawAll && amt > maxNum) {
      setError('Insufficient vault balance.');
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
      const txHash = withdrawAll
        ? await vaultClient.withdrawAll(address as `0x${string}`)
        : await vaultClient.withdraw(withdrawAmount, address as `0x${string}`);

      const displayAmt = withdrawAll ? maxNum : amt;
      const txId = addTransaction({
        type: 'withdraw',
        hash: txHash,
        status: 'confirming',
        description: withdrawAll ? 'Withdrawing all USDC from vault' : `Withdrawing ${withdrawAmount} USDC`,
        amount: displayAmt.toFixed(2),
        token: 'USDC',
        chainId: VAULT_CHAIN_ID,
        blockExplorerUrl: `${ARBISCAN}/tx/${txHash}`,
      });
      onClose();
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      updateTransaction(txId, { status: 'success' });
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Withdraw failed';
      if (msg.includes('User rejected') || msg.includes('denied')) {
        setError('Transaction cancelled.');
      } else {
        setError(msg);
      }
      setIsLoading(false);
    }
  };

  const footer = (
    <>
      <button
        type="button"
        className="term-modal-primary"
        onClick={() => runWithdraw(amount, false)}
        disabled={isLoading || !amount || parseFloat(amount) <= 0 || !onArbitrum}
      >
        {isLoading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Confirm in wallet…
          </>
        ) : (
          <>
            <ArrowUpRight size={16} />
            Withdraw
          </>
        )}
      </button>
      <button
        type="button"
        className="term-modal-secondary"
        onClick={() => runWithdraw(maxAmount, true)}
        disabled={isLoading || maxNum <= 0 || !onArbitrum}
      >
        Withdraw all
      </button>
    </>
  );

  return (
    <TerminalModalFrame
      title="Withdraw from vault"
      subtitle="USDC returns to your wallet"
      icon={<ArrowUpRight size={18} className="text-[#ea580c]" />}
      onClose={onClose}
      closeDisabled={isLoading}
      footer={footer}
    >
      {!onArbitrum && (
        <p className="term-modal-note term-modal-note--warn">
          Switch to Arbitrum in the header before withdrawing.
        </p>
      )}

      <div className="term-modal-card">
        <span className="term-modal-label">Available</span>
        <strong className="term-modal-value">
          ${maxNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
          USDC
        </strong>
      </div>

      <label className="term-modal-label" htmlFor="term-withdraw-amt">
        Amount
      </label>
      <div className="term-modal-input-row">
        <input
          id="term-withdraw-amt"
          type="number"
          className="term-modal-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={isLoading}
          placeholder="0.00"
        />
        <button type="button" className="term-modal-link" onClick={() => setAmount(maxAmount)}>
          Max
        </button>
      </div>

      <p className="term-modal-hint">Withdrawal fee: free. Avoid withdrawing during an active trade.</p>

      {error && (
        <div className="term-modal-alert term-modal-alert--err">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
    </TerminalModalFrame>
  );
};

export default TerminalWithdrawModal;
