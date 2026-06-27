import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import { AlertTriangle, ArrowDownToLine, Loader2, Wallet } from 'lucide-react';
import {
  ARBITRUM_LEGACY_VAULTS,
  LEGACY_VAULT_PAYOUT_PATH,
  type LegacyVaultEntry,
} from '../../lib/legacyVaultRegistry';
import { VaultClient, TOKEN_ADDRESSES } from '../../lib/vault';

const WETH = TOKEN_ADDRESSES.WETH;
const WBTC = TOKEN_ADDRESSES.WBTC;

const VAULT_ABI = parseAbi([
  'function balances(address) view returns (uint256)',
  'function getWithdrawable(address user) view returns (uint256)',
  'function withdraw(uint256 amount) external',
  'function withdrawAll() external',
  'function emergencyWithdraw() external',
  'function cancelStuckPosition(address user, address token) external',
  'function getPosition(address user, address token) view returns ((bool isActive, bool isLong, address token, uint256 collateral, uint256 size, uint256 leverage, uint256 entryPrice, uint256 stopLoss, uint256 takeProfit, uint256 timestamp, bytes32 requestKey, uint256 highestPrice, uint256 lowestPrice, uint256 trailingSlBps, bool trailingActivated, bool autoFeaturesEnabled))',
]);

type VaultBalance = {
  vault: LegacyVaultEntry;
  balance: bigint;
  withdrawable: bigint;
  stuckWeth: boolean;
  stuckWbtc: boolean;
  v11EthActive: boolean;
  v11BtcActive: boolean;
};

type Props = {
  /** Full-page emergency payout (always show shell, link-friendly) */
  mode?: 'inline' | 'page';
};

const arbitrumChainId = 42161;

const LegacyVaultWithdraw: React.FC<Props> = ({ mode = 'inline' }) => {
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient({ chainId: arbitrumChainId });
  const { data: walletClient } = useWalletClient();

  const [vaultBalances, setVaultBalances] = useState<VaultBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isPage = mode === 'page';
  const isOnArbitrum = chain?.id === arbitrumChainId;

  const totalBalance = vaultBalances.reduce((sum, vb) => sum + vb.balance, 0n);

  const refreshBalances = useCallback(async () => {
    if (!address || !publicClient) {
      setVaultBalances([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const balances: VaultBalance[] = [];

      for (const vault of ARBITRUM_LEGACY_VAULTS) {
        try {
          const bal = await publicClient.readContract({
            address: vault.address,
            abi: VAULT_ABI,
            functionName: 'balances',
            args: [address],
          });

          if (bal <= 0n) continue;

          let withdrawable = bal;
          try {
            withdrawable = await publicClient.readContract({
              address: vault.address,
              abi: VAULT_ABI,
              functionName: 'getWithdrawable',
              args: [address],
            });
          } catch {
            // Older contracts may not expose getWithdrawable
          }

          let stuckWeth = false;
          let stuckWbtc = false;
          let v11EthActive = false;
          let v11BtcActive = false;

          if (vault.legacyStuckPositions) {
            try {
              const wethPos = await publicClient.readContract({
                address: vault.address,
                abi: VAULT_ABI,
                functionName: 'getPosition',
                args: [address, WETH],
              });
              stuckWeth = wethPos.isActive;
            } catch {
              /* optional */
            }

            try {
              const wbtcPos = await publicClient.readContract({
                address: vault.address,
                abi: VAULT_ABI,
                functionName: 'getPosition',
                args: [address, WBTC],
              });
              stuckWbtc = wbtcPos.isActive;
            } catch {
              /* optional */
            }
          }

          if (vault.modern && publicClient && walletClient) {
            try {
              const vaultClient = new VaultClient(publicClient, walletClient, arbitrumChainId);
              const ethPos = await vaultClient.getPosition(address, WETH);
              v11EthActive = ethPos.isActive;
              const btcPos = await vaultClient.getPosition(address, WBTC);
              v11BtcActive = btcPos.isActive;
            } catch {
              /* optional */
            }
          }

          balances.push({
            vault,
            balance: bal,
            withdrawable,
            stuckWeth,
            stuckWbtc,
            v11EthActive,
            v11BtcActive,
          });
        } catch (e) {
          console.error(`Legacy vault scan failed ${vault.address}:`, e);
        }
      }

      setVaultBalances(balances);
    } catch (e) {
      console.error('Legacy vault scan failed:', e);
      setVaultBalances([]);
    } finally {
      setLoading(false);
    }
  }, [address, publicClient, walletClient]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  const handleCancelStuckPosition = async (
    vaultAddress: `0x${string}`,
    token: `0x${string}`,
    tokenName: string
  ) => {
    if (!walletClient || !address) return;

    setWithdrawing(`${vaultAddress}-cancel-${tokenName}`);
    setError(null);
    setSuccess(null);

    try {
      const hash = await walletClient.writeContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'cancelStuckPosition',
        args: [address, token],
        chain: arbitrum,
      });

      setSuccess(`Cancelling ${tokenName} position… TX ${hash.slice(0, 10)}…`);
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setSuccess(`${tokenName} position cancelled. Refreshing balances…`);
        await refreshBalances();
      } else {
        setError('Transaction failed');
      }
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage || err.message || 'Cancel failed');
    } finally {
      setWithdrawing(null);
    }
  };

  const handleCloseV11Position = async (token: `0x${string}`, tokenName: string) => {
    if (!walletClient || !publicClient || !address) return;

    setWithdrawing(`v11-close-${tokenName}`);
    setError(null);
    setSuccess(null);

    try {
      const vaultClient = new VaultClient(publicClient, walletClient, arbitrumChainId);
      const hash = await vaultClient.userInstantClose(token, address);
      setSuccess(`Closing ${tokenName} position… TX ${hash.slice(0, 10)}…`);
      await publicClient.waitForTransactionReceipt({ hash });
      setSuccess(`${tokenName} position closed. Refreshing balances…`);
      await refreshBalances();
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage || err.message || `Failed to close ${tokenName}`);
    } finally {
      setWithdrawing(null);
    }
  };

  const handleWithdraw = async (entry: VaultBalance, useEmergency: boolean) => {
    if (!walletClient || !address || !publicClient) return;

    const amount =
      entry.withdrawable > 0n
        ? entry.withdrawable
        : entry.balance;

    if (amount === 0n) return;

    const key = `${entry.vault.address}-${useEmergency ? 'emergency' : 'normal'}`;
    setWithdrawing(key);
    setError(null);
    setSuccess(null);

    try {
      let hash: `0x${string}`;

      if (useEmergency || (entry.vault.modern && entry.withdrawable < entry.balance)) {
        hash = await walletClient.writeContract({
          address: entry.vault.address,
          abi: VAULT_ABI,
          functionName: 'emergencyWithdraw',
          args: [],
          chain: arbitrum,
        });
      } else if (amount === entry.balance) {
        try {
          hash = await walletClient.writeContract({
            address: entry.vault.address,
            abi: VAULT_ABI,
            functionName: 'withdrawAll',
            args: [],
            chain: arbitrum,
          });
        } catch {
          hash = await walletClient.writeContract({
            address: entry.vault.address,
            abi: VAULT_ABI,
            functionName: 'withdraw',
            args: [amount],
            chain: arbitrum,
          });
        }
      } else {
        hash = await walletClient.writeContract({
          address: entry.vault.address,
          abi: VAULT_ABI,
          functionName: 'withdraw',
          args: [amount],
          chain: arbitrum,
        });
      }

      setSuccess(`Withdrawal submitted — TX ${hash.slice(0, 10)}…`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setSuccess(`Withdrawal confirmed. ${formatUnits(amount, 6)} USDC sent to your wallet.`);
        await refreshBalances();
      } else {
        setError('Transaction failed');
      }
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      const msg = err.shortMessage || err.message || 'Withdrawal failed';

      if (!useEmergency && entry.vault.modern && /insufficient|balance/i.test(msg)) {
        setWithdrawing(null);
        return handleWithdraw(entry, true);
      }

      setError(msg);
    } finally {
      setWithdrawing(null);
    }
  };

  if (isPage && !isConnected) {
    return (
      <div className="legacy-vault-payout-connect landing-glass-card">
        <Wallet className="legacy-vault-payout-connect-icon" aria-hidden />
        <h2 className="legacy-vault-payout-connect-title">Connect your wallet</h2>
        <p className="legacy-vault-payout-connect-text">
          Use the wallet that originally deposited into the Monadier vault. After connecting on
          Arbitrum One, we scan all legacy contracts for your USDC balance.
        </p>
        <p className="legacy-vault-payout-connect-hint">
          Connect via the button in the top navigation bar.
        </p>
      </div>
    );
  }

  if (loading) {
    if (!isPage && !isConnected) return null;
    return (
      <div className={`legacy-vault-payout-loading${isPage ? ' legacy-vault-payout-loading--page' : ''}`}>
        <Loader2 className="animate-spin" size={20} aria-hidden />
        <span>Scanning legacy vault contracts…</span>
      </div>
    );
  }

  if (!isConnected) return null;

  if (vaultBalances.length === 0 || totalBalance === 0n) {
    if (!isPage) return null;
    return (
      <div className="legacy-vault-payout-empty landing-glass-card">
        <p className="legacy-vault-payout-empty-title">No legacy vault balance found</p>
        <p className="legacy-vault-payout-empty-text">
          Connected wallet <span className="font-mono">{address}</span> has no credited USDC in any
          known Monadier vault on Arbitrum. Try another wallet, or contact support with your deposit
          transaction hash.
        </p>
        <button type="button" className="mkt-cta-secondary" onClick={() => void refreshBalances()}>
          Scan again
        </button>
      </div>
    );
  }

  const shellClass = isPage
    ? 'legacy-vault-payout-panel landing-glass-card'
    : 'bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-4';

  return (
    <div className={shellClass}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" aria-hidden />
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-lg mb-2 ${isPage ? 'text-[#0a0a0a]' : 'text-yellow-400'}`}>
            {isPage ? 'Your legacy vault balance' : 'Legacy vault balance found'}
          </h3>
          <p className={`text-sm mb-3 ${isPage ? 'text-[#555]' : 'text-secondary'}`}>
            You have{' '}
            <span className={`font-bold ${isPage ? 'text-[#0a0a0a]' : 'text-yellow-400'}`}>
              {formatUnits(totalBalance, 6)} USDC
            </span>{' '}
            credited across {vaultBalances.length} vault contract
            {vaultBalances.length > 1 ? 's' : ''} on Arbitrum.
          </p>

          {!isOnArbitrum && (
            <p className="text-orange-500 text-sm mb-3 font-semibold">
              Switch to Arbitrum One to withdraw.
            </p>
          )}

          <div className="space-y-4">
            {vaultBalances.map((vb) => {
              const payoutAmount = vb.withdrawable > 0n ? vb.withdrawable : vb.balance;
              const needsEmergency = vb.vault.modern && vb.withdrawable > 0n && vb.withdrawable < vb.balance;
              const hasStuck =
                vb.stuckWeth ||
                vb.stuckWbtc ||
                vb.v11EthActive ||
                vb.v11BtcActive;
              const withdrawDisabled =
                withdrawing !== null || !isOnArbitrum || (payoutAmount === 0n && vb.balance > 0n);

              return (
                <div key={vb.vault.address} className="legacy-vault-payout-card">
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-yellow-500" aria-hidden />
                      <span className={`font-bold ${isPage ? 'text-[#0a0a0a]' : 'text-primary'}`}>
                        {vb.vault.name}
                      </span>
                    </div>
                    <span className="text-muted text-xs font-mono">
                      {vb.vault.address.slice(0, 8)}…{vb.vault.address.slice(-6)}
                    </span>
                  </div>

                  <div className={`text-sm mb-3 ${isPage ? 'text-[#555]' : 'text-secondary'}`}>
                    <p>
                      Balance:{' '}
                      <span className="font-mono">{formatUnits(vb.balance, 6)} USDC</span>
                    </p>
                    {vb.withdrawable > 0n && vb.withdrawable !== vb.balance && (
                      <p className="text-orange-500">
                        Withdrawable now:{' '}
                        <span className="font-mono">{formatUnits(vb.withdrawable, 6)} USDC</span>
                      </p>
                    )}
                  </div>

                  {hasStuck && (
                    <div className="legacy-vault-payout-stuck">
                      <p className="legacy-vault-payout-stuck-title">Open position detected</p>
                      <p className="legacy-vault-payout-stuck-text">
                        Close or cancel stuck positions first to unlock USDC.
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {vb.stuckWeth && (
                          <button
                            type="button"
                            onClick={() => void handleCancelStuckPosition(vb.vault.address, WETH, 'WETH')}
                            disabled={withdrawing !== null || !isOnArbitrum}
                            className="legacy-vault-payout-stuck-btn"
                          >
                            Cancel WETH position
                          </button>
                        )}
                        {vb.stuckWbtc && (
                          <button
                            type="button"
                            onClick={() => void handleCancelStuckPosition(vb.vault.address, WBTC, 'WBTC')}
                            disabled={withdrawing !== null || !isOnArbitrum}
                            className="legacy-vault-payout-stuck-btn"
                          >
                            Cancel WBTC position
                          </button>
                        )}
                        {vb.v11EthActive && (
                          <button
                            type="button"
                            onClick={() => void handleCloseV11Position(WETH, 'WETH')}
                            disabled={withdrawing !== null || !isOnArbitrum}
                            className="legacy-vault-payout-stuck-btn"
                          >
                            Close ETH position (V11)
                          </button>
                        )}
                        {vb.v11BtcActive && (
                          <button
                            type="button"
                            onClick={() => void handleCloseV11Position(WBTC, 'BTC')}
                            disabled={withdrawing !== null || !isOnArbitrum}
                            className="legacy-vault-payout-stuck-btn"
                          >
                            Close BTC position (V11)
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void handleWithdraw(vb, false)}
                      disabled={withdrawDisabled || hasStuck}
                      className="legacy-vault-payout-withdraw-btn"
                    >
                      {withdrawing === `${vb.vault.address}-normal` ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                          Withdrawing…
                        </>
                      ) : (
                        <>
                          <ArrowDownToLine className="w-4 h-4" aria-hidden />
                          Withdraw {formatUnits(payoutAmount, 6)} USDC
                        </>
                      )}
                    </button>

                    {(vb.vault.modern || needsEmergency) && (
                      <button
                        type="button"
                        onClick={() => void handleWithdraw(vb, true)}
                        disabled={withdrawDisabled || hasStuck}
                        className="legacy-vault-payout-emergency-btn"
                      >
                        {withdrawing === `${vb.vault.address}-emergency` ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                            Emergency…
                          </>
                        ) : (
                          'Emergency withdraw'
                        )}
                      </button>
                    )}
                  </div>

                  {payoutAmount === 0n && vb.balance > 0n && !hasStuck && (
                    <p className="text-red-400 text-xs mt-2">
                      Contract USDC liquidity is empty — try Emergency withdraw for a pro-rata payout.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          {success && <p className="text-green-600 text-sm mt-3">{success}</p>}

          {isPage && (
            <p className="legacy-vault-payout-note">
              Share this page:{' '}
              <Link to={LEGACY_VAULT_PAYOUT_PATH} className="legacy-vault-payout-link">
                monadier.com{LEGACY_VAULT_PAYOUT_PATH}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LegacyVaultWithdraw;
