import React, { useState } from 'react';
import { X, Settings, Loader2, AlertCircle, CheckCircle, Zap, Shield, AlertTriangle, Flame, TrendingUp, TrendingDown } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { VaultClient } from '../../lib/vault';
import { supabase } from '../../lib/supabase';

interface VaultSettingsModalProps {
  currentRiskLevel: number;
  autoTradeEnabled: boolean;
  currentTakeProfit?: number;
  currentStopLoss?: number;
  onClose: () => void;
  onSuccess: () => void;
}

const RISK_LEVELS = [
  { value: 1, label: 'Very Low', description: '1% per trade', icon: Shield, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { value: 5, label: 'Low', description: '5% per trade', icon: Shield, color: 'text-green-400', bg: 'bg-green-500/10' },
  { value: 25, label: 'Medium', description: '25% per trade', icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { value: 50, label: 'High', description: '50% per trade', icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { value: 100, label: 'All-In', description: '100% per trade', icon: Flame, color: 'text-purple-400', bg: 'bg-purple-500/10' },
];

export default function VaultSettingsModal({
  currentRiskLevel,
  autoTradeEnabled: initialAutoTrade,
  currentTakeProfit = 5,
  currentStopLoss = 1,
  onClose,
  onSuccess
}: VaultSettingsModalProps) {
  const { chainId, address, publicClient, walletClient } = useWeb3();
  const { linkWallet } = useSubscription();

  const [riskLevel, setRiskLevel] = useState(currentRiskLevel);
  const [autoTrade, setAutoTrade] = useState(initialAutoTrade);
  const [takeProfit, setTakeProfit] = useState(currentTakeProfit);
  const [stopLoss, setStopLoss] = useState(currentStopLoss);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasChanges = riskLevel !== currentRiskLevel ||
    autoTrade !== initialAutoTrade ||
    takeProfit !== currentTakeProfit ||
    stopLoss !== currentStopLoss;

  const handleSave = async () => {
    if (!chainId || !address || !publicClient || !walletClient) return;
    if (!hasChanges) {
      onClose();
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const vaultClient = new VaultClient(publicClient as any, walletClient as any, chainId);

      // Update risk level if changed
      if (riskLevel !== currentRiskLevel) {
        const txHash = await vaultClient.setRiskLevel(riskLevel, address as `0x${string}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }

      // Update auto-trade if changed
      if (autoTrade !== initialAutoTrade) {
        const txHash = await vaultClient.setAutoTrade(autoTrade, address as `0x${string}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });

        // Link wallet to subscription for bot trading (critical for new users!)
        if (autoTrade) {
          await linkWallet(address);
        }
      }

      // Always sync settings to Supabase (including TP/SL)
      await supabase.rpc('upsert_vault_settings', {
        p_wallet_address: address.toLowerCase(),
        p_chain_id: chainId,
        p_auto_trade_enabled: autoTrade,
        p_risk_level_bps: riskLevel * 100, // Convert % to basis points
        p_take_profit_percent: takeProfit,
        p_stop_loss_percent: stopLoss
      });

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      console.error('Settings update failed:', err);
      setError(err.message || 'Failed to update settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyStop = async () => {
    if (!chainId || !address || !publicClient || !walletClient) return;

    try {
      setIsLoading(true);
      setError(null);

      const vaultClient = new VaultClient(publicClient as any, walletClient as any, chainId);
      const txHash = await vaultClient.emergencyStop(address as `0x${string}`);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Sync to Supabase
      await supabase.rpc('upsert_vault_settings', {
        p_wallet_address: address.toLowerCase(),
        p_chain_id: chainId,
        p_auto_trade_enabled: false
      });

      setAutoTrade(false);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      console.error('Emergency stop failed:', err);
      setError(err.message || 'Failed to stop auto-trading');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedRiskLevel = RISK_LEVELS.find(r => r.value === riskLevel) || RISK_LEVELS[1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-800 rounded-lg">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Vault Settings</h2>
              <p className="text-xs text-zinc-500">Configure auto-trading</p>
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
        <div className="p-4 space-y-6">
          {/* Auto-Trade Toggle */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-white font-medium">Auto-Trading</h3>
                <p className="text-xs text-zinc-500">Let the bot trade automatically</p>
              </div>
              <button
                onClick={() => setAutoTrade(!autoTrade)}
                disabled={isLoading}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  autoTrade ? 'bg-green-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                    autoTrade ? 'left-8' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {autoTrade && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <Zap className="w-4 h-4" />
                  <span>Bot will trade based on AI signals</span>
                </div>
              </div>
            )}
          </div>

          {/* Risk Level Slider */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-medium">Risk Level</h3>
              <span className={`text-sm font-medium ${selectedRiskLevel.color}`}>
                {selectedRiskLevel.label} ({riskLevel}%)
              </span>
            </div>

            {/* Slider */}
            <div className="mb-4">
              <input
                type="range"
                min="1"
                max="100"
                value={riskLevel}
                onChange={(e) => setRiskLevel(parseInt(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <div className="flex justify-between text-xs text-zinc-500 mt-1">
                <span>1%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Risk Level Presets */}
            <div className="grid grid-cols-5 gap-2">
              {RISK_LEVELS.map((level) => {
                const Icon = level.icon;
                const isSelected = riskLevel === level.value;
                return (
                  <button
                    key={level.value}
                    onClick={() => setRiskLevel(level.value)}
                    disabled={isLoading}
                    className={`p-2 rounded-lg border transition-all ${
                      isSelected
                        ? `${level.bg} border-current ${level.color}`
                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mx-auto mb-1 ${isSelected ? level.color : ''}`} />
                    <span className="text-[10px] block">{level.value}%</span>
                  </button>
                );
              })}
            </div>

            {/* Risk Description */}
            <div className={`mt-3 p-3 rounded-lg ${selectedRiskLevel.bg}`}>
              <p className={`text-sm ${selectedRiskLevel.color}`}>
                <strong>{selectedRiskLevel.label}:</strong> Each trade will use up to {riskLevel}% of your vault balance.
                {riskLevel >= 50 && (
                  <span className="block mt-1 text-xs opacity-80">
                    Higher risk = higher potential gains, but also higher potential losses.
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Take Profit & Stop Loss */}
          <div className="border-t border-zinc-800 pt-4">
            <h3 className="text-white font-medium mb-4">Take Profit & Stop Loss</h3>

            {/* Take Profit Slider */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-zinc-400">Take Profit</span>
                </div>
                <span className="text-sm font-medium text-green-400">{takeProfit}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={takeProfit}
                onChange={(e) => setTakeProfit(parseFloat(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <div className="flex justify-between text-xs text-zinc-500 mt-1">
                <span>1%</span>
                <span>10%</span>
                <span>20%</span>
              </div>
            </div>

            {/* Stop Loss Slider */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-zinc-400">Trailing Stop Loss</span>
                </div>
                <span className="text-sm font-medium text-red-400">{stopLoss}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={stopLoss}
                onChange={(e) => setStopLoss(parseFloat(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
              <div className="flex justify-between text-xs text-zinc-500 mt-1">
                <span>0.5%</span>
                <span>5%</span>
                <span>10%</span>
              </div>
            </div>

            {/* TP/SL Info */}
            <div className="bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-400">
              <p><strong className="text-zinc-300">Take Profit:</strong> Close position when price rises {takeProfit}% from entry.</p>
              <p className="mt-1"><strong className="text-zinc-300">Trailing Stop:</strong> Auto-adjusts as price rises. Triggers when price drops {stopLoss}% from peak.</p>
            </div>
          </div>

          {/* Emergency Stop */}
          {initialAutoTrade && (
            <div className="pt-2 border-t border-zinc-800">
              <button
                onClick={handleEmergencyStop}
                disabled={isLoading}
                className="w-full py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 font-medium rounded-lg hover:bg-red-500/20 transition-colors text-sm flex items-center justify-center gap-2"
              >
                <AlertCircle className="w-4 h-4" />
                Emergency Stop Auto-Trading
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 rounded-lg p-3">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Settings updated successfully!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={handleSave}
            disabled={isLoading || success}
            className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : success ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Saved!
              </>
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
