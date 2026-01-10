import React, { useState, useEffect } from 'react';
import { X, ArrowDownLeft, Loader2, AlertCircle } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useTransactions } from '../../contexts/TransactionContext';
import { VaultClient, VAULT_ADDRESSES, USDC_ADDRESSES, USDC_DECIMALS, getPlatformFeeForChain } from '../../lib/vault';
import { formatUnits } from 'viem';
import { ERC20_ABI } from '../../lib/dex/router';

interface VaultDepositModalProps {
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

export default function VaultDepositModal({ onClose, onSuccess }: VaultDepositModalProps) {
  const { chainId, address, publicClient, walletClient } = useWeb3();
  const { addTransaction, updateTransaction } = useTransactions();

  const [amount, setAmount] = useState('');
  const [usdcBalance, setUsdcBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const platformFee = chainId ? getPlatformFeeForChain(chainId) : { percentFormatted: '1.0%' };

  // Load USDC balance
  useEffect(() => {
    const loadBalance = async () => {
      if (!chainId || !address || !publicClient) return;

      try {
        setIsLoadingBalance(true);
        const usdcAddress = USDC_ADDRESSES[chainId];
        if (!usdcAddress) return;

        const balance = await publicClient.readContract({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`]
        });

        setUsdcBalance(formatUnits(balance as bigint, USDC_DECIMALS));
      } catch (err) {
        console.error('Failed to load USDC balance:', err);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    loadBalance();
  }, [chainId, address, publicClient]);

  const handleMaxClick = () => {
    setAmount(usdcBalance);
  };

  const handleDeposit = async () => {
    if (!chainId || !address || !publicClient || !walletClient) return;
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (parseFloat(amount) > parseFloat(usdcBalance)) {
      setError('Insufficient USDC balance');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const vaultClient = new VaultClient(publicClient as any, walletClient as any, chainId);
      const blockExplorer = BLOCK_EXPLORERS[chainId] || 'https://basescan.org';

      // Execute deposit (includes approval if needed)
      const txHash = await vaultClient.deposit(amount, address as `0x${string}`);

      // Add transaction to toast - close modal immediately
      const txId = addTransaction({
        type: 'deposit',
        hash: txHash,
        status: 'confirming',
        description: `Depositing ${amount} USDC to vault`,
        amount: parseFloat(amount).toFixed(2),
        token: 'USDC',
        chainId,
        blockExplorerUrl: `${blockExplorer}/tx/${txHash}`
      });

      // Close modal immediately - user can track in toast
      onClose();

      // Wait for confirmation in background
      try {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        updateTransaction(txId, { status: 'success' });
        // Trigger success callback to refresh balances
        onSuccess();
      } catch (confirmError) {
        console.error('Transaction failed:', confirmError);
        updateTransaction(txId, { status: 'failed' });
      }
    } catch (err: any) {
      console.error('Deposit failed:', err);

      // User rejected or other error before tx was sent
      if (err.message?.includes('User rejected') || err.message?.includes('denied')) {
        setError('Transaction cancelled');
      } else {
        setError(err.message || 'Failed to deposit');
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
            <div className="p-2 bg-green-500/10 rounded-lg">
              <ArrowDownLeft className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Deposit to Vault</h2>
              <p className="text-xs text-zinc-500">USDC only</p>
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
          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-zinc-400">Amount</label>
              <button
                onClick={handleMaxClick}
                disabled={isLoading || isLoadingBalance}
                className="text-xs text-white hover:text-gray-300 transition-colors"
              >
                Max: {isLoadingBalance ? '...' : parseFloat(usdcBalance).toFixed(2)} USDC
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

          {/* Fee Info */}
          <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Platform Fee</span>
              <span className="text-white">{platformFee.percentFormatted} per trade</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Deposit Fee</span>
              <span className="text-green-500">Free</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Withdraw Fee</span>
              <span className="text-green-500">Free</span>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-xs text-blue-400">
              Deposited funds will be used for automated trading. You can withdraw anytime.
              The bot will trade based on AI signals using your configured risk level.
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
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={handleDeposit}
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
                <ArrowDownLeft className="w-4 h-4" />
                Deposit USDC
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
