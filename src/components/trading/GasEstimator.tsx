import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, AlertTriangle, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { CHAIN_GAS_ESTIMATES } from '../../lib/chains';

interface GasEstimatorProps {
  chainId: number;
  tradeAmount: number;
  nativeTokenPrice: number;
  slippagePercent: number;
  expectedOutput: number;
  priceImpact: number;
  onWarning?: (hasWarning: boolean) => void;
}

export const GasEstimator: React.FC<GasEstimatorProps> = ({
  chainId,
  tradeAmount,
  nativeTokenPrice,
  slippagePercent,
  expectedOutput,
  priceImpact,
  onWarning
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [gasPrice, setGasPrice] = useState<number>(0);

  // Get chain gas estimates
  const gasEstimate = CHAIN_GAS_ESTIMATES[chainId] || {
    swapGas: 150000,
    approveGas: 46000,
    avgGasPrice: 10
  };

  // Calculate gas cost
  const gasCostNative = (gasEstimate.swapGas * (gasPrice || gasEstimate.avgGasPrice)) / 1e9;
  const gasCostUsd = gasCostNative * nativeTokenPrice;
  const gasPercentage = tradeAmount > 0 ? (gasCostUsd / tradeAmount) * 100 : 0;

  // Calculate net after fees
  const netAfterGas = tradeAmount - gasCostUsd;
  const minReceived = expectedOutput * (1 - slippagePercent / 100);

  // Warnings
  const highGasWarning = gasPercentage > 5;
  const highSlippageWarning = slippagePercent > 2;
  const highPriceImpactWarning = priceImpact > 1;
  const hasAnyWarning = highGasWarning || highSlippageWarning || highPriceImpactWarning;

  useEffect(() => {
    if (onWarning) {
      onWarning(hasAnyWarning);
    }
  }, [hasAnyWarning, onWarning]);

  // Simulate fetching live gas price
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      // Add some variance to the average
      setGasPrice(gasEstimate.avgGasPrice * (0.8 + Math.random() * 0.4));
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [chainId, gasEstimate.avgGasPrice]);

  if (isLoading) {
    return (
      <div className="p-4 bg-card-dark rounded-xl border border-gray-800">
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Estimating gas...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-card-dark rounded-xl border border-gray-800 space-y-3">
      <div className="flex items-center gap-2 text-white font-medium">
        <Flame className="w-4 h-4 text-orange-400" />
        <span>Trade Estimate</span>
      </div>

      {/* Trade breakdown */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Trade Amount</span>
          <span className="text-white">${tradeAmount.toFixed(2)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Expected Output</span>
          <span className="text-white">{expectedOutput.toFixed(6)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Min. Received ({slippagePercent}% slip)</span>
          <span className="text-gray-300">{minReceived.toFixed(6)}</span>
        </div>

        <div className="border-t border-gray-700 pt-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Estimated Gas</span>
            <span className={`${highGasWarning ? 'text-orange-400' : 'text-gray-300'}`}>
              ${gasCostUsd.toFixed(2)} ({gasPercentage.toFixed(1)}%)
            </span>
          </div>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-400">Price Impact</span>
          <span className={`${highPriceImpactWarning ? 'text-orange-400' : 'text-gray-300'}`}>
            {priceImpact.toFixed(2)}%
          </span>
        </div>

        <div className="border-t border-gray-700 pt-2">
          <div className="flex justify-between font-medium">
            <span className="text-white">Net Value</span>
            <span className={netAfterGas > 0 ? 'text-green-400' : 'text-red-400'}>
              ${netAfterGas.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {hasAnyWarning && (
        <div className="space-y-2 pt-2">
          {highGasWarning && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 p-2 bg-orange-500/10 border border-orange-500/20 rounded-lg"
            >
              <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="text-orange-400 font-medium">High Gas Cost</p>
                <p className="text-gray-400">
                  Gas is {gasPercentage.toFixed(1)}% of your trade. Consider trading on BSC or Arbitrum for lower fees.
                </p>
              </div>
            </motion.div>
          )}

          {highSlippageWarning && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg"
            >
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="text-yellow-400 font-medium">High Slippage</p>
                <p className="text-gray-400">
                  {slippagePercent}% slippage may result in unfavorable execution.
                </p>
              </div>
            </motion.div>
          )}

          {highPriceImpactWarning && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg"
            >
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="text-red-400 font-medium">High Price Impact</p>
                <p className="text-gray-400">
                  Your trade is {priceImpact.toFixed(2)}% of pool liquidity. Consider splitting into smaller orders.
                </p>
              </div>
            </motion.div>
          )}
        </div>
      )}

    </div>
  );
};

export default GasEstimator;
