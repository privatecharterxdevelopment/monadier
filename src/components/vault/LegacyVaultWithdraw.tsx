import React, { useState, useEffect } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import { AlertTriangle, Wallet, ArrowDownToLine, Loader2 } from 'lucide-react';

// HARDCODED: Legacy vault on Arbitrum with Claudio's 100 USDC
const LEGACY_VAULT = '0x712B3A0cFD00674a15c5D235e998F71709112675' as const;

const LEGACY_ABI = parseAbi([
  'function balances(address) view returns (uint256)',
  'function withdraw(uint256 amount) external',
  'function withdrawAll() external',
]);

// Create a dedicated client for Arbitrum
const arbitrumClient = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc'),
});

const LegacyVaultWithdraw: React.FC = () => {
  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isOnArbitrum = chain?.id === 42161;

  useEffect(() => {
    if (!isConnected || !address) {
      setLoading(false);
      return;
    }

    const fetchBalance = async () => {
      setLoading(true);
      try {
        const bal = await arbitrumClient.readContract({
          address: LEGACY_VAULT,
          abi: LEGACY_ABI,
          functionName: 'balances',
          args: [address],
        });
        setBalance(bal);
      } catch (e) {
        console.error('Failed to fetch legacy balance:', e);
        setBalance(0n);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
  }, [address, isConnected]);

  const handleWithdrawAll = async () => {
    if (!walletClient || !address || !balance || balance === 0n) return;

    setWithdrawing(true);
    setError(null);
    setSuccess(null);

    try {
      const hash = await walletClient.writeContract({
        address: LEGACY_VAULT,
        abi: LEGACY_ABI,
        functionName: 'withdrawAll',
        chain: arbitrum,
      });

      setSuccess(`Withdrawal submitted! TX: ${hash.slice(0, 10)}...`);

      // Wait for confirmation
      const receipt = await arbitrumClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setSuccess(`Withdrawal confirmed! ${formatUnits(balance, 6)} USDC sent to your wallet.`);
        setBalance(0n);
      } else {
        setError('Transaction failed');
      }
    } catch (e: any) {
      setError(e.shortMessage || e.message || 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };

  // Show loading state
  if (loading) {
    return null; // Don't show anything while loading
  }

  // Don't show if no legacy balance
  if (!balance || balance === 0n) {
    return null;
  }

  const formattedBalance = formatUnits(balance, 6);

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="text-yellow-400 font-bold text-lg mb-2">
            Legacy Vault Balance Found!
          </h3>
          <p className="text-white/70 text-sm mb-3">
            You have <span className="text-yellow-400 font-bold">{formattedBalance} USDC</span> in an old vault contract on Arbitrum.
            Click below to withdraw it to your wallet.
          </p>

          {!isOnArbitrum && (
            <p className="text-orange-400 text-sm mb-3 font-bold">
              Please switch to Arbitrum network to withdraw!
            </p>
          )}

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg">
              <Wallet className="w-4 h-4 text-yellow-400" />
              <span className="text-white font-mono text-sm">{formattedBalance} USDC</span>
            </div>

            <button
              onClick={handleWithdrawAll}
              disabled={withdrawing || !isOnArbitrum || balance === 0n}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-500/50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-all"
            >
              {withdrawing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Withdrawing...
                </>
              ) : (
                <>
                  <ArrowDownToLine className="w-4 h-4" />
                  Withdraw All
                </>
              )}
            </button>
          </div>

          {error && (
            <p className="text-red-400 text-sm mt-2">{error}</p>
          )}
          {success && (
            <p className="text-green-400 text-sm mt-2">{success}</p>
          )}

          <p className="text-white/40 text-xs mt-3">
            Contract: {LEGACY_VAULT.slice(0, 10)}...{LEGACY_VAULT.slice(-8)} (Arbitrum)
          </p>
        </div>
      </div>
    </div>
  );
};

export default LegacyVaultWithdraw;
