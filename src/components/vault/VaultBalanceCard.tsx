import React, { useState, useEffect } from 'react';
import { Wallet, ArrowUpRight, ArrowDownLeft, Settings, Zap, Lock, AlertTriangle } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { SUBSCRIPTION_PLANS } from '../../lib/subscription';
import { VaultClient, VAULT_ADDRESSES, VAULT_V2_ADDRESSES, getPlatformFeeForChain, USDC_DECIMALS } from '../../lib/vault';
import { formatUnits } from 'viem';
import VaultDepositModal from './VaultDepositModal';
import VaultWithdrawModal from './VaultWithdrawModal';
import VaultSettingsModal from './VaultSettingsModal';

interface VaultBalanceCardProps {
  compact?: boolean; // For dashboard view
}

export default function VaultBalanceCard({ compact = false }: VaultBalanceCardProps) {
  const { isConnected, chainId, address, publicClient, walletClient } = useWeb3();
  const { planTier, isSubscribed, openUpgradeModal, dailyTradesRemaining, subscription } = useSubscription();

  // Get daily trade limit info
  const getDailyTradeInfo = () => {
    if (!planTier || planTier === 'free') {
      return { limit: 5, used: subscription?.dailyTradesUsed || 0, remaining: 0, unlimited: false };
    }
    const plan = SUBSCRIPTION_PLANS[planTier];
    if (!plan) return { limit: 0, used: 0, remaining: 0, unlimited: false };

    const limit = plan.features.dailyTradeLimit;
    const unlimited = limit === -1;
    const used = subscription?.dailyTradesUsed || 0;
    const remaining = unlimited ? -1 : Math.max(0, limit - used);

    return { limit, used, remaining, unlimited };
  };

  const tradeInfo = getDailyTradeInfo();
  const canTrade = tradeInfo.unlimited || tradeInfo.remaining > 0;

  const [vaultBalance, setVaultBalance] = useState<string>('0.00');
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [riskLevelPercent, setRiskLevelPercent] = useState(5);
  const [maxTradeSize, setMaxTradeSize] = useState<string>('0.00');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Check if user has paid subscription (not free)
  const isPaidUser = isSubscribed && planTier && planTier !== 'free';
  const isVaultAvailable = chainId ? (VAULT_V2_ADDRESSES[chainId] !== null || VAULT_ADDRESSES[chainId] !== null) : false;

  // Get platform fee for current chain
  const platformFee = chainId ? getPlatformFeeForChain(chainId) : { percentFormatted: '—' };

  // Load vault data
  useEffect(() => {
    const loadVaultData = async () => {
      if (!isConnected || !chainId || !address || !publicClient || !isVaultAvailable) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const vaultAddress = VAULT_V2_ADDRESSES[chainId] || VAULT_ADDRESSES[chainId];
        if (!vaultAddress) {
          setIsLoading(false);
          return;
        }

        // Read vault balance and status
        const vaultClient = new VaultClient(publicClient as any, walletClient as any, chainId);
        const status = await vaultClient.getUserStatus(address as `0x${string}`);

        setVaultBalance(status.balanceFormatted);
        setAutoTradeEnabled(status.autoTradeEnabled);
        setRiskLevelPercent(status.riskLevelPercent);
        setMaxTradeSize(status.maxTradeSizeFormatted);
      } catch (err) {
        console.error('Failed to load vault data:', err);
        setError('Failed to load vault');
      } finally {
        setIsLoading(false);
      }
    };

    loadVaultData();
  }, [isConnected, chainId, address, publicClient, walletClient, isVaultAvailable]);

  // Handle upgrade click
  const handleUpgradeClick = () => {
    openUpgradeModal('Auto-Trading Vault is available for paid subscribers only. Upgrade to enable automated trading without signing each transaction.');
  };

  // If not a paid user, show upgrade prompt
  if (!isPaidUser) {
    return (
      <div className={`bg-zinc-900/50 border border-zinc-800 rounded-xl ${compact ? 'p-4' : 'p-6'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-zinc-800 rounded-lg">
            <Lock className="w-5 h-5 text-zinc-500" />
          </div>
          <div>
            <h3 className="text-white font-medium">Auto-Trading Vault</h3>
            <p className="text-xs text-zinc-500">Premium Feature</p>
          </div>
        </div>

        <p className="text-sm text-zinc-400 mb-4">
          Deposit funds and let the bot trade automatically without signing each transaction.
        </p>

        <button
          onClick={handleUpgradeClick}
          className="w-full py-2.5 bg-gradient-to-r from-white to-gray-300 text-black font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4" />
          Upgrade to Unlock
        </button>
      </div>
    );
  }

  // Vault not deployed on this chain - show preview mode
  const isPreviewMode = !isVaultAvailable;

  // Not connected
  if (!isConnected) {
    return (
      <div className={`bg-zinc-900/50 border border-zinc-800 rounded-xl ${compact ? 'p-4' : 'p-6'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-zinc-800 rounded-lg">
            <Wallet className="w-5 h-5 text-zinc-500" />
          </div>
          <div>
            <h3 className="text-white font-medium">Auto-Trading Vault</h3>
            <p className="text-xs text-zinc-500">Connect wallet to view</p>
          </div>
        </div>
      </div>
    );
  }

  // Main vault card
  return (
    <>
      <div className={`bg-zinc-900/50 border border-zinc-800 rounded-xl ${compact ? 'p-4' : 'p-6'} ${isPreviewMode ? 'relative overflow-hidden' : ''}`}>
        {/* Preview Mode Banner */}
        {isPreviewMode && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded text-[10px] text-yellow-400 font-medium">
            Coming Soon
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${autoTradeEnabled && !isPreviewMode ? 'bg-green-500/10' : 'bg-zinc-800'}`}>
              <Wallet className={`w-5 h-5 ${autoTradeEnabled && !isPreviewMode ? 'text-green-500' : 'text-zinc-400'}`} />
            </div>
            <div>
              <h3 className="text-white font-medium">Bot Wallet</h3>
              <p className={`text-xs ${autoTradeEnabled && !isPreviewMode ? 'text-green-500' : 'text-zinc-500'}`}>
                {isPreviewMode ? 'Vault Not Deployed' : autoTradeEnabled ? 'Auto-Trading Active' : 'Auto-Trading Off'}
              </p>
            </div>
          </div>

          {!compact && !isPreviewMode && (
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Balance */}
        <div className="mb-4">
          {isLoading && !isPreviewMode ? (
            <div className="animate-pulse">
              <div className="h-8 bg-zinc-800 rounded w-32 mb-1" />
              <div className="h-4 bg-zinc-800 rounded w-24" />
            </div>
          ) : error && !isPreviewMode ? (
            <p className="text-red-400 text-sm">{error}</p>
          ) : (
            <>
              <p className={`text-2xl font-bold ${isPreviewMode ? 'text-zinc-500' : 'text-white'}`}>
                ${isPreviewMode ? '0.00' : parseFloat(vaultBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-zinc-500">
                USDC in Vault • Fee: {platformFee.percentFormatted}
              </p>
            </>
          )}
        </div>

        {/* Risk Level & Max Trade (non-compact only) */}
        {!compact && (!isLoading || isPreviewMode) && (!error || isPreviewMode) && (
          <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-zinc-800/50 rounded-lg">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Risk Level</p>
              <p className={`text-sm font-medium ${isPreviewMode ? 'text-zinc-500' : 'text-white'}`}>
                {isPreviewMode ? '5%' : `${riskLevelPercent}%`}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Max Trade</p>
              <p className={`text-sm font-medium ${isPreviewMode ? 'text-zinc-500' : 'text-white'}`}>
                ${isPreviewMode ? '0.00' : parseFloat(maxTradeSize).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Daily Trades</p>
              <p className={`text-sm font-medium ${
                tradeInfo.unlimited ? 'text-green-400' :
                tradeInfo.remaining > 5 ? 'text-white' :
                tradeInfo.remaining > 0 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {tradeInfo.unlimited ? 'Unlimited' : `${tradeInfo.remaining} left`}
              </p>
            </div>
          </div>
        )}

        {/* Daily Trade Limit Warning */}
        {!canTrade && !isPreviewMode && (
          <div className="flex items-center gap-2 p-2 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-red-400 text-xs">Daily trade limit reached. Resets at midnight UTC.</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-2'} gap-2`}>
          <button
            onClick={() => setShowDepositModal(true)}
            disabled={isLoading || isPreviewMode}
            className={`flex items-center justify-center gap-2 py-2.5 font-medium rounded-lg transition-colors disabled:opacity-50 ${
              isPreviewMode
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                : 'bg-white text-black hover:bg-gray-100'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            Deposit
          </button>
          <button
            onClick={() => !isPreviewMode && setShowWithdrawModal(true)}
            disabled={isLoading || parseFloat(vaultBalance) === 0 || isPreviewMode}
            className="flex items-center justify-center gap-2 py-2.5 bg-zinc-800 text-white font-medium rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <ArrowUpRight className="w-4 h-4" />
            Withdraw
          </button>
        </div>

        {/* Preview Mode Info */}
        {isPreviewMode && (
          <p className="text-xs text-zinc-500 text-center mt-3">
            Contract deployment in progress. Switch to Base for 1% fees.
          </p>
        )}

        {/* Settings link for compact mode */}
        {compact && !isPreviewMode && (
          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-full mt-2 py-2 text-sm text-zinc-400 hover:text-white transition-colors flex items-center justify-center gap-1"
          >
            <Settings className="w-3 h-3" />
            Vault Settings
          </button>
        )}
      </div>

      {/* Modals */}
      {showDepositModal && (
        <VaultDepositModal
          onClose={() => setShowDepositModal(false)}
          onSuccess={() => {
            setShowDepositModal(false);
            // Reload vault data
            window.location.reload();
          }}
        />
      )}

      {showWithdrawModal && (
        <VaultWithdrawModal
          maxAmount={vaultBalance}
          onClose={() => setShowWithdrawModal(false)}
          onSuccess={() => {
            setShowWithdrawModal(false);
            window.location.reload();
          }}
        />
      )}

      {showSettingsModal && (
        <VaultSettingsModal
          currentRiskLevel={riskLevelPercent}
          autoTradeEnabled={autoTradeEnabled}
          onClose={() => setShowSettingsModal(false)}
          onSuccess={() => {
            setShowSettingsModal(false);
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
