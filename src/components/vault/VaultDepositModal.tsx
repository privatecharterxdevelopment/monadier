import React, { useState, useEffect } from 'react';
import { X, ArrowDownLeft, Loader2, AlertCircle, Coins } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useTransactions } from '../../contexts/TransactionContext';
import { VaultClient, USDC_ADDRESSES, USDC_DECIMALS, getPlatformFee, VAULT_ADDRESS, VAULT_CHAIN_ID } from '../../lib/vault';
import { formatUnits } from 'viem';
import { ERC20_ABI } from '../../lib/dex/router';
import { supabase } from '../../lib/supabase';

interface VaultDepositModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type DepositType = 'usdc' | 'eth';

// Block explorer URLs by chain
const BLOCK_EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  56: 'https://bscscan.com',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  8453: 'https://basescan.org'
};

// Chain names
const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  56: 'BSC',
  137: 'Polygon',
  42161: 'Arbitrum',
  8453: 'Base'
};

export default function VaultDepositModal({ onClose, onSuccess }: VaultDepositModalProps) {
  const { chainId, address, publicClient, walletClient } = useWeb3();
  const { addTransaction, updateTransaction } = useTransactions();

  const [depositType, setDepositType] = useState<DepositType>('usdc');
  const [amount, setAmount] = useState('');
  const [usdcBalance, setUsdcBalance] = useState<string>('0');
  const [ethBalance, setEthBalance] = useState<string>('0');
  const [ethPrice, setEthPrice] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const platformFee = getPlatformFee();

  // V8 GMX minimum vault balance requirement ($50 - matches smart contract)
  // Arbitrum only now
  const isV8Chain = chainId === VAULT_CHAIN_ID;
  const minDepositAmount = isV8Chain ? 50 : 0;

  // Check if amount is below minimum
  const depositAmount = depositType === 'usdc'
    ? parseFloat(amount || '0')
    : parseFloat(estimatedUsdc || '0');
  const isBelowMinimum = isV8Chain && depositAmount > 0 && depositAmount < minDepositAmount;

  // Calculate estimated USDC for ETH
  const estimatedUsdc = depositType === 'eth' && amount && ethPrice > 0
    ? (parseFloat(amount) * ethPrice).toFixed(2)
    : '0';

  // Load balances and ETH price
  useEffect(() => {
    const loadBalances = async () => {
      if (!chainId || !address || !publicClient) return;

      try {
        setIsLoadingBalance(true);

        // Load USDC balance
        const usdcAddress = USDC_ADDRESSES[chainId];
        if (usdcAddress) {
          const balance = await publicClient.readContract({
            address: usdcAddress,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as `0x${string}`]
          });
          setUsdcBalance(formatUnits(balance as bigint, USDC_DECIMALS));
        }

        // Load ETH balance
        const ethBal = await publicClient.getBalance({ address: address as `0x${string}` });
        setEthBalance(formatUnits(ethBal, 18));

        // Fetch ETH price from Binance
        try {
          const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDC');
          const data = await res.json();
          setEthPrice(parseFloat(data.price) || 0);
        } catch (e) {
          console.error('Failed to fetch ETH price:', e);
          setEthPrice(3200); // Fallback
        }
      } catch (err) {
        console.error('Failed to load balances:', err);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    loadBalances();
  }, [chainId, address, publicClient]);

  const handleMaxClick = () => {
    if (depositType === 'usdc') {
      setAmount(usdcBalance);
    } else {
      // Leave some ETH for gas (0.001 ETH)
      const maxEth = Math.max(0, parseFloat(ethBalance) - 0.001);
      setAmount(maxEth > 0 ? maxEth.toFixed(6) : '0');
    }
  };

  const handleDeposit = async () => {
    if (!chainId || !address || !publicClient || !walletClient) return;
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    const currentBalance = depositType === 'usdc' ? usdcBalance : ethBalance;
    if (parseFloat(amount) > parseFloat(currentBalance)) {
      setError(`Insufficient ${depositType === 'usdc' ? 'USDC' : 'ETH'} balance`);
      return;
    }

    // Check minimum for V6 chains
    if (isV8Chain && depositAmount < minDepositAmount) {
      setError(`Minimum deposit is $${minDepositAmount} USDC for bot trading`);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const vaultClient = new VaultClient(publicClient as any, walletClient as any, chainId);
      const blockExplorer = BLOCK_EXPLORERS[chainId] || 'https://arbiscan.io';

      let txHash: `0x${string}`;
      let description: string;
      let tokenSymbol: string;

      if (depositType === 'usdc') {
        // USDC deposit
        txHash = await vaultClient.deposit(amount, address as `0x${string}`);
        description = `Depositing ${amount} USDC to vault`;
        tokenSymbol = 'USDC';
      } else {
        // ETH deposit - calculate minUsdcOut with 2% slippage
        const expectedUsdc = parseFloat(amount) * ethPrice;
        const minUsdcOut = (expectedUsdc * 0.98).toFixed(2); // 2% slippage
        txHash = await vaultClient.depositETH(amount, minUsdcOut, address as `0x${string}`);
        description = `Depositing ${amount} ETH (~$${estimatedUsdc}) to vault`;
        tokenSymbol = 'ETH';
      }

      // Add transaction to toast - close modal immediately
      const txId = addTransaction({
        type: 'deposit',
        hash: txHash,
        status: 'confirming',
        description,
        amount: parseFloat(amount).toFixed(depositType === 'usdc' ? 2 : 6),
        token: tokenSymbol,
        chainId,
        blockExplorerUrl: `${blockExplorer}/tx/${txHash}`
      });

      // Close modal immediately - user can track in toast
      onClose();

      // Wait for confirmation in background
      try {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        updateTransaction(txId, { status: 'success' });

        // Sync vault_settings after successful deposit
        // This ensures the bot knows about this wallet
        try {
          const vaultStatus = await vaultClient.getUserStatus(address as `0x${string}`);
          await supabase
            .from('vault_settings')
            .upsert({
              wallet_address: address.toLowerCase(),
              chain_id: chainId,
              auto_trade_enabled: vaultStatus.autoTradeEnabled,
              risk_level_bps: vaultStatus.riskLevelBps,
              updated_at: new Date().toISOString(),
              synced_at: new Date().toISOString()
            }, {
              onConflict: 'wallet_address,chain_id'
            });
          console.log('Vault settings synced after deposit:', { autoTrade: vaultStatus.autoTradeEnabled });
        } catch (syncErr) {
          console.error('Failed to sync vault settings:', syncErr);
        }

        onSuccess();
      } catch (confirmError) {
        console.error('Transaction failed:', confirmError);
        updateTransaction(txId, { status: 'failed' });
      }
    } catch (err: any) {
      console.error('Deposit failed:', err);
      const msg = err.shortMessage || err.message || '';

      if (msg.includes('User rejected') || msg.includes('denied')) {
        setError('Transaction cancelled');
      } else if (msg.includes('insufficient funds') || msg.includes('gas * price')) {
        setError('Not enough ETH for gas fees. You need a small amount of ETH on Arbitrum (~$0.10) to pay for transaction fees.');
      } else {
        setError(msg || 'Failed to deposit');
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
              <p className="text-xs text-zinc-500">
                {chainId ? CHAIN_NAMES[chainId] || 'Unknown' : 'Not connected'}
                {isV8Chain ? ' (V7 GMX - 25x Leverage)' : ''}
              </p>
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
          {/* Token Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { setDepositType('usdc'); setAmount(''); setError(null); }}
              disabled={isLoading}
              className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                depositType === 'usdc'
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              <Coins className="w-4 h-4" />
              USDC
            </button>
            <button
              onClick={() => { setDepositType('eth'); setAmount(''); setError(null); }}
              disabled={isLoading}
              className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                depositType === 'eth'
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z"/>
              </svg>
              ETH
            </button>
          </div>

          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-zinc-400">Amount</label>
              <button
                onClick={handleMaxClick}
                disabled={isLoading || isLoadingBalance}
                className="text-xs text-white hover:text-gray-300 transition-colors"
              >
                Max: {isLoadingBalance ? '...' : depositType === 'usdc'
                  ? `${parseFloat(usdcBalance).toFixed(2)} USDC`
                  : `${parseFloat(ethBalance).toFixed(4)} ETH`
                }
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isLoading}
                placeholder="0.00"
                step={depositType === 'eth' ? '0.001' : '0.01'}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-lg placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-medium">
                {depositType === 'usdc' ? 'USDC' : 'ETH'}
              </span>
            </div>
          </div>

          {/* ETH to USDC estimate */}
          {depositType === 'eth' && amount && parseFloat(amount) > 0 && (
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Estimated USDC</span>
                <span className="text-white font-medium">~{estimatedUsdc} USDC</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-zinc-500">ETH Price</span>
                <span className="text-zinc-400">${ethPrice.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-zinc-500">Slippage</span>
                <span className="text-zinc-400">2% max</span>
              </div>
            </div>
          )}

          {/* Fee Info */}
          <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
            {isV8Chain ? (
              // V7 GMX fees (Arbitrum)
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Position Fee</span>
                  <span className="text-white">0.1% on total position</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Success Fee</span>
                  <span className="text-white">10% of profit only</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">GMX Fee</span>
                  <span className="text-white">~0.1% (GMX Perpetuals)</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Max Leverage</span>
                  <span className="text-purple-400">25x (50x Elite)</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Loss Fee</span>
                  <span className="text-green-500">None</span>
                </div>
              </>
            ) : (
              // Fallback fees
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Platform Fee</span>
                  <span className="text-white">1% per trade</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">DEX Fee</span>
                  <span className="text-white">0.3% (Uniswap V2)</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Deposit Fee</span>
              <span className="text-green-500">Free</span>
            </div>
            {depositType === 'eth' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Swap</span>
                <span className="text-zinc-300">ETH auto-swaps to USDC</span>
              </div>
            )}
          </div>

          {/* Minimum Amount Warning for V7 GMX */}
          {isV8Chain && (
            <div className={`rounded-lg p-3 ${isBelowMinimum ? 'bg-red-500/10 border border-red-500/20' : 'bg-yellow-500/10 border border-yellow-500/20'}`}>
              <p className={`text-xs ${isBelowMinimum ? 'text-red-400' : 'text-yellow-400'}`}>
                {isBelowMinimum
                  ? `Minimum deposit is $${minDepositAmount} USDC for GMX trading on Arbitrum`
                  : `Minimum vault balance: $${minDepositAmount} USDC required for GMX trading`
                }
              </p>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-xs text-blue-400">
              {depositType === 'usdc'
                ? 'Deposited USDC will be used for automated trading. You can withdraw anytime.'
                : 'ETH will be automatically swapped to USDC on deposit. Vault balance is always in USDC.'
              }
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
            disabled={isLoading || !amount || parseFloat(amount) <= 0 || isBelowMinimum}
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
                Deposit {depositType === 'usdc' ? 'USDC' : 'ETH'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
