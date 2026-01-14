import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  X,
  AlertTriangle,
  Clock,
  Target,
  Shield,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { useOnChainPositions, FormattedPosition } from '../../hooks/useOnChainPositions';

interface OnChainPositionsProps {
  showHeader?: boolean;
}

const OnChainPositions: React.FC<OnChainPositionsProps> = ({ showHeader = true }) => {
  const {
    positions,
    loading,
    error,
    prices,
    closePosition,
    cancelAuto,
    refresh,
  } = useOnChainPositions();

  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [cancellingPosition, setCancellingPosition] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<FormattedPosition | null>(null);

  const handleClose = async (position: FormattedPosition) => {
    try {
      setClosingPosition(position.id);
      const hash = await closePosition(position.token);
      console.log('Close position tx:', hash);
      // Refresh after a short delay
      setTimeout(refresh, 2000);
    } catch (err) {
      console.error('Failed to close position:', err);
      alert('Failed to close position: ' + (err as Error).message);
    } finally {
      setClosingPosition(null);
      setConfirmClose(null);
    }
  };

  const handleCancelAuto = async (position: FormattedPosition) => {
    try {
      setCancellingPosition(position.id);
      const hash = await cancelAuto(position.token);
      console.log('Cancel auto tx:', hash);
      setTimeout(refresh, 2000);
    } catch (err) {
      console.error('Failed to cancel auto-features:', err);
      alert('Failed to cancel: ' + (err as Error).message);
    } finally {
      setCancellingPosition(null);
    }
  };

  if (loading && positions.length === 0) {
    return (
      <div className="bg-[#0D0D0D] border border-white/5 rounded-xl p-6">
        <div className="flex items-center justify-center py-8">
          <Activity className="w-6 h-6 text-cyan-400 animate-pulse mr-2" />
          <span className="text-white/60">Loading on-chain positions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#0D0D0D] border border-red-500/20 rounded-xl p-6">
        <div className="flex items-center text-red-400">
          <AlertTriangle className="w-5 h-5 mr-2" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="bg-[#0D0D0D] border border-white/5 rounded-xl p-6">
        {showHeader && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              V8 On-Chain Positions
            </h3>
            <div className="flex items-center gap-2 text-xs text-white/40">
              <span>ETH: ${prices.weth.toLocaleString()}</span>
              <span>BTC: ${prices.wbtc.toLocaleString()}</span>
            </div>
          </div>
        )}
        <div className="text-center py-8 text-white/40">
          No active positions on V8 contract
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            V8 Live Positions
          </h3>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/60">
              ETH: <span className="text-cyan-400">${prices.weth.toLocaleString()}</span>
            </span>
            <span className="text-white/60">
              BTC: <span className="text-orange-400">${prices.wbtc.toLocaleString()}</span>
            </span>
          </div>
        </div>
      )}

      {positions.map((position) => (
        <motion.div
          key={position.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0D0D0D] border border-white/10 rounded-xl p-4 hover:border-cyan-500/30 transition-all"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  position.isLong ? 'bg-green-500/20' : 'bg-red-500/20'
                }`}
              >
                {position.isLong ? (
                  <TrendingUp className="w-5 h-5 text-green-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-lg">
                    {position.tokenSymbol}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      position.isLong
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {position.direction}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
                    {position.leverage}x
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/50 mt-1">
                  <Clock className="w-3 h-3" />
                  <span>{position.duration}</span>
                </div>
              </div>
            </div>

            {/* P/L Display */}
            <div className="text-right">
              <div
                className={`text-2xl font-bold ${
                  position.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {position.pnlFormatted}
              </div>
              <div
                className={`text-sm ${
                  position.pnlPercent >= 0 ? 'text-green-400/70' : 'text-red-400/70'
                }`}
              >
                {position.pnlPercent >= 0 ? '+' : ''}
                {position.pnlPercent.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Position Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-white/40 text-xs mb-1">Entry Price</div>
              <div className="text-white font-medium">{position.entryPriceFormatted}</div>
            </div>
            <div>
              <div className="text-white/40 text-xs mb-1">Current Price</div>
              <div className="text-cyan-400 font-medium">
                {position.currentPriceFormatted}
              </div>
            </div>
            <div>
              <div className="text-white/40 text-xs mb-1">Collateral</div>
              <div className="text-white font-medium">
                ${position.collateral.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-white/40 text-xs mb-1">Size</div>
              <div className="text-white font-medium">
                ${position.size.toFixed(2)}
              </div>
            </div>
          </div>

          {/* SL/TP Info */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-1 px-2 py-1 bg-red-500/10 rounded text-xs">
              <Shield className="w-3 h-3 text-red-400" />
              <span className="text-white/60">SL:</span>
              <span className="text-red-400">{position.stopLoss}</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded text-xs">
              <Target className="w-3 h-3 text-green-400" />
              <span className="text-white/60">TP:</span>
              <span className="text-green-400">{position.takeProfit}</span>
            </div>
            {position.trailingInfo && (
              <div className="flex items-center gap-1 px-2 py-1 bg-purple-500/10 rounded text-xs">
                <Zap className="w-3 h-3 text-purple-400" />
                <span className="text-purple-400">{position.trailingInfo}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmClose(position)}
              disabled={closingPosition === position.id}
              className="flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {closingPosition === position.id ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  Closing...
                </>
              ) : (
                <>
                  <X className="w-4 h-4" />
                  Close Position
                </>
              )}
            </button>

            {position.autoFeaturesEnabled && (
              <button
                onClick={() => handleCancelAuto(position)}
                disabled={cancellingPosition === position.id}
                className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {cancellingPosition === position.id ? (
                  <Activity className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                Disable Auto
              </button>
            )}
          </div>
        </motion.div>
      ))}

      {/* Confirmation Modal */}
      {confirmClose && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#1A1A1A] border border-white/10 rounded-xl p-6 max-w-md w-full mx-4"
          >
            <h3 className="text-xl font-bold text-white mb-4">Close Position?</h3>
            <p className="text-white/60 mb-4">
              Are you sure you want to close your {confirmClose.tokenSymbol}{' '}
              {confirmClose.direction} position?
            </p>
            <div className="bg-black/30 rounded-lg p-4 mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-white/50">Current P/L:</span>
                <span
                  className={
                    confirmClose.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                  }
                >
                  {confirmClose.pnlFormatted} ({confirmClose.pnlPercent.toFixed(2)}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Collateral:</span>
                <span className="text-white">${confirmClose.collateral.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmClose(null)}
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleClose(confirmClose)}
                disabled={closingPosition !== null}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {closingPosition ? 'Closing...' : 'Close Position'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default OnChainPositions;
