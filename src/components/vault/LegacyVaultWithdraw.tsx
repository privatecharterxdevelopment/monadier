import React, { useState, useEffect } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import { AlertTriangle, Wallet, ArrowDownToLine, Loader2 } from 'lucide-react';

// ALL Legacy vaults on Arbitrum that may have stuck funds
const LEGACY_VAULTS = [
  { address: '0x712B3A0cFD00674a15c5D235e998F71709112675', name: 'V7 Original', hasStuckPositions: false },
  { address: '0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6', name: 'V8 Callback Bug', hasStuckPositions: true },
  { address: '0xFA38c191134A6a3382794BE6144D24c3e6D8a4C3', name: 'V8 Legacy', hasStuckPositions: true },
  { address: '0x9879792a47725d5b18633e1395BC4a7A06c750df', name: 'V7', hasStuckPositions: false },
] as const;

const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const WBTC = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

const LEGACY_ABI = parseAbi([
  'function balances(address) view returns (uint256)',
  'function withdraw(uint256 amount) external',
  'function getWithdrawable(address user) view returns (uint256)',
  'function cancelStuckPosition(address user, address token) external',
  'function getPosition(address user, address token) view returns ((bool isActive, bool isLong, address token, uint256 collateral, uint256 size, uint256 leverage, uint256 entryPrice, uint256 stopLoss, uint256 takeProfit, uint256 timestamp, bytes32 requestKey, uint256 highestPrice, uint256 lowestPrice, uint256 trailingSlBps, bool trailingActivated, bool autoFeaturesEnabled))',
]);

// Create a dedicated client for Arbitrum
const arbitrumClient = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc'),
});

interface VaultBalance {
  vault: `0x${string}`;
  name: string;
  balance: bigint;
  withdrawable: bigint;
  hasStuckPositions: boolean;
  stuckWeth: boolean;
  stuckWbtc: boolean;
}

const LegacyVaultWithdraw: React.FC = () => {
  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [vaultBalances, setVaultBalances] = useState<VaultBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isOnArbitrum = chain?.id === 42161;

  // Calculate total balance across all vaults
  const totalBalance = vaultBalances.reduce((sum, vb) => sum + vb.balance, 0n);

  useEffect(() => {
    if (!isConnected || !address) {
      setLoading(false);
      return;
    }

    const fetchAllBalances = async () => {
      setLoading(true);
      try {
        const balances: VaultBalance[] = [];

        for (const vault of LEGACY_VAULTS) {
          try {
            const bal = await arbitrumClient.readContract({
              address: vault.address as `0x${string}`,
              abi: LEGACY_ABI,
              functionName: 'balances',
              args: [address],
            });

            if (bal > 0n) {
              // Check withdrawable amount
              let withdrawable = bal;
              try {
                withdrawable = await arbitrumClient.readContract({
                  address: vault.address as `0x${string}`,
                  abi: LEGACY_ABI,
                  functionName: 'getWithdrawable',
                  args: [address],
                });
              } catch {
                // Function might not exist
              }

              // Check for stuck positions
              let stuckWeth = false;
              let stuckWbtc = false;

              if (vault.hasStuckPositions) {
                try {
                  const wethPos = await arbitrumClient.readContract({
                    address: vault.address as `0x${string}`,
                    abi: LEGACY_ABI,
                    functionName: 'getPosition',
                    args: [address, WETH as `0x${string}`],
                  });
                  stuckWeth = wethPos.isActive;
                } catch {}

                try {
                  const wbtcPos = await arbitrumClient.readContract({
                    address: vault.address as `0x${string}`,
                    abi: LEGACY_ABI,
                    functionName: 'getPosition',
                    args: [address, WBTC as `0x${string}`],
                  });
                  stuckWbtc = wbtcPos.isActive;
                } catch {}
              }

              balances.push({
                vault: vault.address as `0x${string}`,
                name: vault.name,
                balance: bal,
                withdrawable,
                hasStuckPositions: vault.hasStuckPositions,
                stuckWeth,
                stuckWbtc,
              });
            }
          } catch (e) {
            console.error(`Failed to fetch balance from ${vault.address}:`, e);
          }
        }

        setVaultBalances(balances);
      } catch (e) {
        console.error('Failed to fetch legacy balances:', e);
        setVaultBalances([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAllBalances();
  }, [address, isConnected]);

  const handleCancelStuckPosition = async (vaultAddress: `0x${string}`, token: `0x${string}`, tokenName: string) => {
    if (!walletClient || !address) return;

    setWithdrawing(`${vaultAddress}-cancel-${tokenName}`);
    setError(null);
    setSuccess(null);

    try {
      const hash = await walletClient.writeContract({
        address: vaultAddress,
        abi: LEGACY_ABI,
        functionName: 'cancelStuckPosition',
        args: [address, token],
        chain: arbitrum,
      });

      setSuccess(`Cancelling ${tokenName} position... TX: ${hash.slice(0, 10)}...`);

      const receipt = await arbitrumClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setSuccess(`${tokenName} position cancelled! Collateral refunded to your balance.`);
        // Refresh balances
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setError('Transaction failed');
      }
    } catch (e: any) {
      setError(e.shortMessage || e.message || 'Cancel failed');
    } finally {
      setWithdrawing(null);
    }
  };

  const handleWithdraw = async (vaultAddress: `0x${string}`, amount: bigint) => {
    if (!walletClient || !address || amount === 0n) return;

    setWithdrawing(vaultAddress);
    setError(null);
    setSuccess(null);

    try {
      const hash = await walletClient.writeContract({
        address: vaultAddress,
        abi: LEGACY_ABI,
        functionName: 'withdraw',
        args: [amount],
        chain: arbitrum,
      });

      setSuccess(`Withdrawal submitted! TX: ${hash.slice(0, 10)}...`);

      const receipt = await arbitrumClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setSuccess(`Withdrawal confirmed! ${formatUnits(amount, 6)} USDC sent to your wallet.`);
        setVaultBalances(prev => prev.filter(vb => vb.vault !== vaultAddress));
      } else {
        setError('Transaction failed');
      }
    } catch (e: any) {
      setError(e.shortMessage || e.message || 'Withdrawal failed');
    } finally {
      setWithdrawing(null);
    }
  };

  // Show loading state
  if (loading) {
    return null;
  }

  // Don't show if no legacy balances
  if (vaultBalances.length === 0 || totalBalance === 0n) {
    return null;
  }

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="text-yellow-400 font-bold text-lg mb-2">
            Legacy Vault Balance Found!
          </h3>
          <p className="text-white/70 text-sm mb-3">
            You have <span className="text-yellow-400 font-bold">{formatUnits(totalBalance, 6)} USDC</span> in {vaultBalances.length} old vault contract{vaultBalances.length > 1 ? 's' : ''} on Arbitrum.
          </p>

          {!isOnArbitrum && (
            <p className="text-orange-400 text-sm mb-3 font-bold">
              Please switch to Arbitrum network to withdraw!
            </p>
          )}

          <div className="space-y-4">
            {vaultBalances.map((vb) => (
              <div key={vb.vault} className="bg-black/20 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-yellow-400" />
                    <span className="text-white font-bold">{vb.name}</span>
                  </div>
                  <span className="text-white/40 text-xs font-mono">
                    {vb.vault.slice(0, 8)}...{vb.vault.slice(-6)}
                  </span>
                </div>

                <div className="text-sm text-white/70 mb-3">
                  <p>Balance: <span className="text-white font-mono">{formatUnits(vb.balance, 6)} USDC</span></p>
                  {vb.withdrawable < vb.balance && (
                    <p className="text-orange-400">Withdrawable: <span className="font-mono">{formatUnits(vb.withdrawable, 6)} USDC</span></p>
                  )}
                </div>

                {/* Stuck Positions Warning */}
                {(vb.stuckWeth || vb.stuckWbtc) && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3">
                    <p className="text-red-400 text-sm font-bold mb-2">Stuck Positions Detected!</p>
                    <p className="text-white/60 text-xs mb-2">Cancel these ghost positions to unlock your collateral:</p>
                    <div className="flex gap-2 flex-wrap">
                      {vb.stuckWeth && (
                        <button
                          onClick={() => handleCancelStuckPosition(vb.vault, WETH as `0x${string}`, 'WETH')}
                          disabled={withdrawing !== null || !isOnArbitrum}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white text-xs font-bold rounded transition-all"
                        >
                          {withdrawing === `${vb.vault}-cancel-WETH` ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            'Cancel WETH Position'
                          )}
                        </button>
                      )}
                      {vb.stuckWbtc && (
                        <button
                          onClick={() => handleCancelStuckPosition(vb.vault, WBTC as `0x${string}`, 'WBTC')}
                          disabled={withdrawing !== null || !isOnArbitrum}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white text-xs font-bold rounded transition-all"
                        >
                          {withdrawing === `${vb.vault}-cancel-WBTC` ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            'Cancel WBTC Position'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Withdraw Button */}
                <button
                  onClick={() => handleWithdraw(vb.vault, vb.withdrawable > 0n ? vb.withdrawable : vb.balance)}
                  disabled={withdrawing !== null || !isOnArbitrum || (vb.withdrawable === 0n && vb.balance > 0n)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-500/50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-all text-sm"
                >
                  {withdrawing === vb.vault ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Withdrawing...
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="w-4 h-4" />
                      Withdraw {formatUnits(vb.withdrawable > 0n ? vb.withdrawable : vb.balance, 6)} USDC
                    </>
                  )}
                </button>

                {vb.withdrawable === 0n && vb.balance > 0n && !vb.stuckWeth && !vb.stuckWbtc && (
                  <p className="text-red-400 text-xs mt-2">Contract has insufficient USDC. Funds may be lost in trades.</p>
                )}
              </div>
            ))}
          </div>

          {error && (
            <p className="text-red-400 text-sm mt-2">{error}</p>
          )}
          {success && (
            <p className="text-green-400 text-sm mt-2">{success}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LegacyVaultWithdraw;
