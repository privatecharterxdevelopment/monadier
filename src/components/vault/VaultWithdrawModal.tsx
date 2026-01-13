import React, { useState } from 'react';
import { X, ArrowUpRight, Loader2, AlertCircle } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useTransactions } from '../../contexts/TransactionContext';
import { VaultClient } from '../../lib/vault';

interface VaultWithdrawModalProps {
  maxAmount: string;
  onClose: () => void;
  onSuccess: () => void;
}

// Block explorer URLs by chain
const BLOCK_EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  56: 'https://bscscan.com',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  8453: 'https://basescan.org'
};

export default function VaultWithdrawModal({ maxAmount, onClose, onSuccess }: VaultWithdrawModalProps) {
  const { chainId, address, publicClient, walletClient } = useWeb3();
  const { addTransaction, updateTransaction } = useTransactions();

  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMaxClick = () => {
    setAmount(maxAmount);
  };

  const handleWithdraw = async () => {
    if (!chainId || !address || !publicClient || !walletClient) return;
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (parseFloat(amount) > parseFloat(maxAmount)) {
      setError('Insufficient vault balance');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const vaultClient = new VaultClient(publicClient as any, walletClient as any, chainId);
      const blockExplorer = BLOCK_EXPLORERS[chainId] || 'https://arbiscan.io';

      const txHash = await vaultClient.withdraw(amount, address as `0x${string}`);

      // Add transaction to toast - close modal immediately
      const txId = addTransaction({
        type: 'withdraw',
        hash: txHash,
        status: 'confirming',
        description: `Withdrawing ${amount} USDC from vault`,
        amount: parseFloat(amount).toFixed(2),
        token: 'USDC',
        chainId,
        blockExplorerUrl: `${blockExplorer}/tx/${txHash}`
      });

      // Close modal immediately
      onClose();

      // Wait for confirmation in background
      try {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        updateTransaction(txId, { status: 'success' });
        onSuccess();
      } catch (confirmError) {
        console.error('Transaction failed:', confirmError);
        updateTransaction(txId, { status: 'failed' });
      }
    } catch (err: any) {
      console.error('Withdraw failed:', err);
      if (err.message?.includes('User rejected') || err.message?.includes('denied')) {
        setError('Transaction cancelled');
      } else {
        setError(err.message || 'Failed to withdraw');
      }
      setIsLoading(false);
    }
  };

  const handleWithdrawAll = async () => {
    if (!chainId || !address || !publicClient || !walletClient) return;

    try {
      setIsLoading(true);
      setError(null);

      const vaultClient = new VaultClient(publicClient as any, walletClient as any, chainId);
      const blockExplorer = BLOCK_EXPLORERS[chainId] || 'https://arbiscan.io';

      const txHash = await vaultClient.withdrawAll(address as `0x${string}`);

      // Add transaction to toast - close modal immediately
      const txId = addTransaction({
        type: 'withdraw',
        hash: txHash,
        status: 'confirming',
        description: `Withdrawing all USDC from vault`,
        amount: parseFloat(maxAmount).toFixed(2),
        token: 'USDC',
        chainId,
        blockExplorerUrl: `${blockExplorer}/tx/${txHash}`
      });

      // Close modal immediately
      onClose();

      // Wait for confirmation in background
      try {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        updateTransaction(txId, { status: 'success' });
        onSuccess();
      } catch (confirmError) {
        console.error('Transaction failed:', confirmError);
        updateTransaction(txId, { status: 'failed' });
      }
    } catch (err: any) {
      console.error('Withdraw all failed:', err);
      if (err.message?.includes('User rejected') || err.message?.includes('denied')) {
        setError('Transaction cancelled');
      } else {
        setError(err.message || 'Failed to withdraw');
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <ArrowUpRight className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Withdraw from Vault</h2>
              <p className="text-xs text-zinc-500">Back to your wallet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Current Balance */}
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <p className="text-xs text-zinc-500 mb-1">Available to Withdraw</p>
            <p className="text-xl font-bold text-white">
              ${parseFloat(maxAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
            </p>
          </div>

          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-zinc-400">Amount</label>
              <button
                onClick={handleMaxClick}
                disabled={isLoading}
                className="text-xs text-white hover:text-gray-300 transition-colors"
              >
                Max
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isLoading}
                placeholder="0.00"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-lg placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-medium">
                USDC
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Withdrawal Fee</span>
              <span className="text-green-500">Free</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">You'll Receive</span>
              <span className="text-white font-medium">
                {amount ? `$${parseFloat(amount).toFixed(2)}` : '$0.00'} USDC
              </span>
            </div>
          </div>

          {/* Warning if auto-trade is enabled */}
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
            <p className="text-xs text-yellow-400">
              Withdrawing funds will reduce your available trading balance.
              Make sure you're not withdrawing during an active trade.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 space-y-2">
          <button
            onClick={handleWithdraw}
            disabled={isLoading || !amount || parseFloat(amount) <= 0}
            className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Confirm in wallet...
              </>
            ) : (
              <>
                <ArrowUpRight className="w-4 h-4" />
                Withdraw
              </>
            )}
          </button>

          <button
            onClick={handleWithdrawAll}
            disabled={isLoading || parseFloat(maxAmount) <= 0}
            className="w-full py-2.5 bg-zinc-800 text-white font-medium rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-50 text-sm"
          >
            Withdraw All
          </button>
        </div>
      </div>
    </div>
  );
}
