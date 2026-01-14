import React, { useState, useEffect } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, parseAbi } from 'viem';
import { AlertTriangle, Wallet, ArrowDownToLine } from 'lucide-react';
import { LEGACY_VAULT_ADDRESSES, USDC_ADDRESSES } from '../../lib/vault';

const LEGACY_ABI = parseAbi([
  'function balances(address) view returns (uint256)',
  'function withdraw(uint256 amount) external',
  'function withdrawAll() external',
]);

const LegacyVaultWithdraw: React.FC = () => {
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const chainId = chain?.id || 42161;
  const legacyVault = LEGACY_VAULT_ADDRESSES[chainId];

  useEffect(() => {
    if (!isConnected || !address || !publicClient || !legacyVault) return;

    const fetchBalance = async () => {
      setLoading(true);
      try {
        const bal = await publicClient.readContract({
          address: legacyVault,
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
  }, [address, isConnected, publicClient, legacyVault]);

  const handleWithdrawAll = async () => {
    if (!walletClient || !address || !legacyVault || balance === 0n) return;

    setWithdrawing(true);
    setError(null);
    setSuccess(null);

    try {
      const hash = await walletClient.writeContract({
        address: legacyVault,
        abi: LEGACY_ABI,
        functionName: 'withdrawAll',
      });

      setSuccess(`Withdrawal submitted! TX: ${hash.slice(0, 10)}...`);

      // Wait for confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
        setSuccess(`Withdrawal confirmed! ${formatUnits(balance, 6)} USDC sent to your wallet.`);
        setBalance(0n);
      }
    } catch (e: any) {
      setError(e.shortMessage || e.message || 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };

  // Don't show if no legacy balance
  if (!legacyVault || balance === 0n) {
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
            You have <span className="text-yellow-400 font-bold">{formattedBalance} USDC</span> in an old vault contract.
            Click below to withdraw it to your wallet.
          </p>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg">
              <Wallet className="w-4 h-4 text-yellow-400" />
              <span className="text-white font-mono text-sm">{formattedBalance} USDC</span>
            </div>

            <button
              onClick={handleWithdrawAll}
              disabled={withdrawing || balance === 0n}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-500/50 text-black font-bold rounded-lg transition-all"
            >
              {withdrawing ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
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
            Contract: {legacyVault?.slice(0, 10)}...{legacyVault?.slice(-8)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LegacyVaultWithdraw;
