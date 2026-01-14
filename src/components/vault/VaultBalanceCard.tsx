import React, { useState, useEffect, useRef } from 'react';
import { Wallet, ArrowUpRight, ArrowDownLeft, Settings, Zap, Lock, AlertTriangle, RefreshCw, ArrowRight, Play, Square, Loader2 } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { SUBSCRIPTION_PLANS } from '../../lib/subscription';
import { VaultClient, VAULT_ADDRESS, VAULT_CHAIN_ID, getPlatformFee, USDC_DECIMALS, VAULT_ABI } from '../../lib/vault';
import { formatUnits } from 'viem';
import VaultDepositModal from './VaultDepositModal';
import VaultWithdrawModal from './VaultWithdrawModal';
import VaultSettingsModal from './VaultSettingsModal';
import { supabase } from '../../lib/supabase';

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
  const [takeProfit, setTakeProfit] = useState(5);
  const [stopLoss, setStopLoss] = useState(1);
  const [askPermission, setAskPermission] = useState(false);
  const [leverage, setLeverage] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsStartMode, setSettingsStartMode] = useState(false);

  // V1 Migration state
  const [v1Balance, setV1Balance] = useState<string>('0.00');
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  // V7 Legacy vault state
  const [v7Balance, setV7Balance] = useState<string>('0.00');
  const [isWithdrawingV7, setIsWithdrawingV7] = useState(false);
  const [v7Error, setV7Error] = useState<string | null>(null);
  const V7_VAULT_ADDRESS = '0x9879792a47725d5b18633e1395BC4a7A06c750df' as `0x${string}`;

  // Bot toggle state
  const [isTogglingBot, setIsTogglingBot] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [botActiveTime, setBotActiveTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [showDepositPrompt, setShowDepositPrompt] = useState(false);

  // Check if user has paid subscription (not free)
  const isPaidUser = isSubscribed && planTier && planTier !== 'free';
  // V8: Arbitrum only
  const isVaultAvailable = chainId === VAULT_CHAIN_ID;
  const isPreviewMode = !isVaultAvailable;
  const hasV1Funds = parseFloat(v1Balance) > 0;
  const hasV7Funds = parseFloat(v7Balance) > 0;

  // Get platform fee (V8 unified)
  const platformFee = getPlatformFee();

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

        // V8: Only Arbitrum vault
        if (chainId !== VAULT_CHAIN_ID) {
          setIsLoading(false);
          return;
        }
        const vaultAddress = VAULT_ADDRESS;

        // Read vault balance and status
        const vaultClient = new VaultClient(publicClient as any, walletClient as any, chainId);
        const status = await vaultClient.getUserStatus(address as `0x${string}`);

        setVaultBalance(status.balanceFormatted);
        setAutoTradeEnabled(status.autoTradeEnabled);
        setRiskLevelPercent(status.riskLevelPercent);
        setMaxTradeSize(status.maxTradeSizeFormatted);

        // Fetch TP/SL, ask_permission, and leverage settings from Supabase
        try {
          const { data: vaultSettings } = await supabase
            .from('vault_settings')
            .select('take_profit_percent, stop_loss_percent, ask_permission, leverage_multiplier')
            .eq('wallet_address', address.toLowerCase())
            .eq('chain_id', chainId)
            .single();

          if (vaultSettings) {
            setTakeProfit(vaultSettings.take_profit_percent || 5);
            setStopLoss(vaultSettings.stop_loss_percent || 1);
            setAskPermission(vaultSettings.ask_permission || false);
            setLeverage(vaultSettings.leverage_multiplier || 1.0);
          }
        } catch (e) {
          // Settings may not exist yet, use defaults
        }

        // Check V7 legacy vault balance
        try {
          const v7BalanceRaw = await publicClient.readContract({
            address: V7_VAULT_ADDRESS,
            abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }],
            functionName: 'balances',
            args: [address as `0x${string}`]
          }) as bigint;
          setV7Balance(formatUnits(v7BalanceRaw, 6));
        } catch (e) {
          console.log('No V7 vault balance');
        }
      } catch (err) {
        console.error('Failed to load vault data:', err);
        setError('Failed to load vault');
      } finally {
        setIsLoading(false);
      }
    };

    loadVaultData();
  }, [isConnected, chainId, address, publicClient, walletClient, isVaultAvailable]);

  // Timer for bot active time - persists across page reloads
  useEffect(() => {
    if (autoTradeEnabled && !isPreviewMode && address) {
      const storageKey = `bot_start_time_${address.toLowerCase()}`;

      // Get or set the start time
      let startTime = localStorage.getItem(storageKey);
      if (!startTime) {
        startTime = Date.now().toString();
        localStorage.setItem(storageKey, startTime);
      }

      // Calculate initial elapsed time
      const initialElapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000);
      setBotActiveTime(initialElapsed);

      // Update every second
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - parseInt(startTime!)) / 1000);
        setBotActiveTime(elapsed);
      }, 1000);
    } else {
      // Stop timer and clear stored start time
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (address) {
        localStorage.removeItem(`bot_start_time_${address.toLowerCase()}`);
      }
      setBotActiveTime(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [autoTradeEnabled, isPreviewMode, address]);

  // Format time display
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Toggle bot on/off
  const handleToggleBot = async () => {
    if (!chainId || !address || !publicClient || !walletClient || isPreviewMode) return;

    try {
      setIsTogglingBot(true);
      setToggleError(null);

      const vaultClient = new VaultClient(publicClient as any, walletClient as any, chainId);
      const newState = !autoTradeEnabled;

      const hash = await vaultClient.setAutoTrade(newState, address as `0x${string}`);

      // Wait for transaction confirmation
      await publicClient.waitForTransactionReceipt({ hash });

      // Update local state
      setAutoTradeEnabled(newState);
    } catch (err: any) {
      console.error('Failed to toggle bot:', err);
      setToggleError(err.shortMessage || err.message || 'Failed to toggle bot');
    } finally {
      setIsTogglingBot(false);
    }
  };

  // V8: Legacy migration removed - no longer needed
  const handleMigrateFromV1 = async () => {
    console.log('V8: Legacy migration not needed');
    setIsMigrating(false);
  };

  // V7 Legacy vault withdrawal
  const handleWithdrawV7 = async () => {
    if (!walletClient || !publicClient || !address) return;

    try {
      setIsWithdrawingV7(true);
      setV7Error(null);

      // V7 only has withdraw(amount), not withdrawAll
      // First get the exact balance
      const v7BalanceRaw = await publicClient.readContract({
        address: V7_VAULT_ADDRESS,
        abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }],
        functionName: 'balances',
        args: [address as `0x${string}`]
      }) as bigint;

      if (v7BalanceRaw === 0n) {
        setV7Error('No balance to withdraw');
        return;
      }

      const V7_WITHDRAW_ABI = [{
        inputs: [{ name: 'amount', type: 'uint256' }],
        name: 'withdraw',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
      }] as const;

      const hash = await walletClient.writeContract({
        address: V7_VAULT_ADDRESS,
        abi: V7_WITHDRAW_ABI,
        functionName: 'withdraw',
        args: [v7BalanceRaw],
        chain: { id: 42161, name: 'Arbitrum One', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://arb1.arbitrum.io/rpc'] } } } as any,
        account: address as `0x${string}`
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setV7Balance('0.00');
      alert('Successfully withdrew from V7 vault!');
    } catch (err: any) {
      console.error('V7 withdraw failed:', err);
      setV7Error(err.shortMessage || err.message || 'Withdrawal failed');
    } finally {
      setIsWithdrawingV7(false);
    }
  };

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
        {/* Switch to Arbitrum Banner */}
        {isPreviewMode && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-[10px] text-blue-400 font-medium">
            Switch to Arbitrum
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${autoTradeEnabled && !isPreviewMode ? 'bg-green-500/10' : 'bg-zinc-800'}`}>
              <Wallet className={`w-5 h-5 ${autoTradeEnabled && !isPreviewMode ? 'text-green-500' : 'text-zinc-400'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-medium">Bot Wallet</h3>
                {/* Prominent Settings Button */}
                {!compact && !isPreviewMode && (
                  <button
                    onClick={() => {
                      setSettingsStartMode(false);
                      setShowSettingsModal(true);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-300 hover:text-white transition-colors"
                  >
                    <Settings className="w-3 h-3" />
                    Settings
                  </button>
                )}
              </div>
              <p className={`text-xs ${autoTradeEnabled && !isPreviewMode ? 'text-green-500' : 'text-zinc-500'}`}>
                {isPreviewMode ? 'Switch to Arbitrum' : autoTradeEnabled ? 'Auto-Trading Active' : 'Auto-Trading Off'}
              </p>
            </div>
          </div>
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
                ${isPreviewMode ? '0.00' : parseFloat(vaultBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
              </p>
              <p className="text-xs text-zinc-500">
                USDC in Vault • No platform fees, 10% win fee only
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

        {/* Bot Play/Stop Toggle Button */}
        {(!isLoading || isPreviewMode) && (!error || isPreviewMode) && !isPreviewMode && (
          <div className="mb-4">
            {parseFloat(vaultBalance) > 0 ? (
              // Has balance - show real toggle
              autoTradeEnabled ? (
                // Bot is running - show Stop button
                <button
                  onClick={handleToggleBot}
                  disabled={isTogglingBot}
                  className="w-full py-4 rounded-xl font-medium flex items-center justify-center gap-3 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed bg-red-500/20 border-2 border-red-500/50 text-red-400 hover:bg-red-500/30"
                >
                  {isTogglingBot ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>Stopping Bot...</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-6 h-6" />
                      <span>Stop Bot</span>
                      <div className="flex items-center gap-2 ml-2 px-2 py-1 bg-red-500/20 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                        <span className="text-xs font-mono">{formatTime(botActiveTime)}</span>
                      </div>
                    </>
                  )}
                </button>
              ) : (
                // Bot is stopped - show Start button that opens settings modal in start mode
                <button
                  onClick={() => {
                    setSettingsStartMode(true);
                    setShowSettingsModal(true);
                  }}
                  disabled={!canTrade}
                  className="w-full py-4 rounded-xl font-medium flex items-center justify-center gap-3 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed bg-green-500/20 border-2 border-green-500/50 text-green-400 hover:bg-green-500/30"
                >
                  <Play className="w-6 h-6" />
                  <span>Start Auto-Trading</span>
                </button>
              )
            ) : (
              // No balance - show disabled button that opens deposit prompt
              <button
                onClick={() => setShowDepositPrompt(true)}
                className="w-full py-4 rounded-xl font-medium flex items-center justify-center gap-3 transition-all duration-300 bg-zinc-800 border-2 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:border-zinc-600"
              >
                <Play className="w-6 h-6" />
                <span>Start Auto-Trading</span>
              </button>
            )}
            {toggleError && (
              <p className="text-red-400 text-xs mt-2 text-center">{toggleError}</p>
            )}
            {autoTradeEnabled && !isTogglingBot && (
              <p className="text-green-400/70 text-xs mt-2 text-center flex items-center justify-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Bot is trading automatically • Checking every 10s
              </p>
            )}
          </div>
        )}

        {/* Deposit Required Popup */}
        {showDepositPrompt && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDepositPrompt(false)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20">
                <Wallet className="w-8 h-8 text-yellow-400" />
              </div>
              <h3 className="text-xl font-semibold text-white text-center mb-2">Deposit Required</h3>
              <p className="text-zinc-400 text-center mb-6">
                You need to deposit USDC into your vault before the bot can start trading automatically.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setShowDepositPrompt(false);
                    setShowDepositModal(true);
                  }}
                  className="w-full py-3 bg-white text-black font-medium rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowDownLeft className="w-5 h-5" />
                  Deposit USDC
                </button>
                <button
                  onClick={() => setShowDepositPrompt(false)}
                  className="w-full py-3 bg-zinc-800 text-zinc-400 font-medium rounded-xl hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
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

        {/* V7 Legacy Vault Banner */}
        {hasV7Funds && !isPreviewMode && (
          <div className="mb-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <span className="text-orange-400 text-sm font-medium">V7 Legacy Vault</span>
              </div>
              <span className="text-orange-400 text-sm font-bold">${parseFloat(v7Balance).toFixed(2)}</span>
            </div>
            <p className="text-orange-400/80 text-xs mb-3">
              You have funds in the old V7 vault. Withdraw to your wallet.
            </p>
            {v7Error && (
              <p className="text-red-400 text-xs mb-2">{v7Error}</p>
            )}
            <button
              onClick={handleWithdrawV7}
              disabled={isWithdrawingV7}
              className="w-full py-2 bg-orange-500 text-black font-medium rounded-lg hover:bg-orange-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isWithdrawingV7 ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Withdrawing...
                </>
              ) : (
                <>
                  <ArrowUpRight className="w-4 h-4" />
                  Withdraw ${parseFloat(v7Balance).toFixed(2)} from V7
                </>
              )}
            </button>
          </div>
        )}

        {/* V1 Migration Banner */}
        {hasV1Funds && !isPreviewMode && (
          <div className="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-400 text-sm font-medium">Funds in Old Vault</span>
              </div>
              <span className="text-yellow-400 text-sm font-bold">${parseFloat(v1Balance).toFixed(2)}</span>
            </div>
            <p className="text-yellow-400/80 text-xs mb-3">
              You have funds in the V1 vault. Withdraw to your wallet, then deposit to the new V2 vault.
            </p>
            {migrationError && (
              <p className="text-red-400 text-xs mb-2">{migrationError}</p>
            )}
            <button
              onClick={handleMigrateFromV1}
              disabled={isMigrating}
              className="w-full py-2 bg-yellow-500 text-black font-medium rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isMigrating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Withdrawing...
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />
                  Withdraw ${parseFloat(v1Balance).toFixed(2)} from V1
                </>
              )}
            </button>
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

        {/* Switch to Arbitrum Prompt */}
        {isPreviewMode && (
          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-xs text-blue-400 text-center mb-2">
              Vault is only available on Arbitrum (0% platform fee + 10% win fee)
            </p>
            <button
              onClick={async () => {
                try {
                  await (window as any).ethereum?.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0xa4b1' }] // 42161 in hex
                  });
                } catch (err: any) {
                  if (err.code === 4902) {
                    await (window as any).ethereum?.request({
                      method: 'wallet_addEthereumChain',
                      params: [{
                        chainId: '0xa4b1',
                        chainName: 'Arbitrum One',
                        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                        rpcUrls: ['https://arb1.arbitrum.io/rpc'],
                        blockExplorerUrls: ['https://arbiscan.io']
                      }]
                    });
                  }
                }
              }}
              className="w-full py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-400 transition-colors text-sm"
            >
              Switch to Arbitrum
            </button>
          </div>
        )}

        {/* Settings link for compact mode */}
        {compact && !isPreviewMode && (
          <button
            onClick={() => {
              setSettingsStartMode(false);
              setShowSettingsModal(true);
            }}
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
          currentTakeProfit={takeProfit}
          currentStopLoss={stopLoss}
          currentAskPermission={askPermission}
          currentLeverage={leverage}
          startMode={settingsStartMode}
          onClose={() => {
            setShowSettingsModal(false);
            setSettingsStartMode(false);
          }}
          onSuccess={() => {
            setShowSettingsModal(false);
            setSettingsStartMode(false);
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
