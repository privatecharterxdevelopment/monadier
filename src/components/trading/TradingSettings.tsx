import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  AlertTriangle,
  Shield,
  Zap,
  History,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Pause,
  Percent,
  DollarSign,
  Flame,
  TestTube,
  Globe
} from 'lucide-react';
import {
  SUPPORTED_CHAINS,
  TESTNET_CHAINS,
  CHAIN_GAS_ESTIMATES,
  ChainConfig,
  isTestnet,
  getAllChains
} from '../../lib/chains';

export type BotMode = 'manual' | 'auto' | 'signals';
export type TradingStrategy = 'spot' | 'grid' | 'dca' | 'arbitrage' | 'custom';
export type TradingInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '24h';

export interface TradingConfig {
  // Chain selection
  selectedChainId: number;
  useTestnet: boolean;

  // Bot mode and strategy
  botMode: BotMode;
  strategy: TradingStrategy;
  tradingInterval: TradingInterval;

  // Slippage
  slippagePercent: number;

  // Safety limits
  maxPositionPercent: number; // Max % of balance per trade
  maxDailyLossPercent: number; // Max daily loss before auto-stop
  maxGasPercent: number; // Warn if gas > this % of trade

  // Grid bot settings
  gridLevels: number; // Number of grid levels
  gridSpreadPercent: number; // Spread between levels

  // DCA settings
  dcaAmount: number; // Amount per DCA buy
  dcaEnabled: boolean;

  // Arbitrage settings
  arbitrageMinSpread: number; // Minimum spread % to execute
  arbitrageDexes: string[]; // DEXes to scan

  // Custom strategy settings
  customConditions: CustomCondition[];

  // Auto trading
  autoPauseOnHighGas: boolean;
  gasThresholdGwei: number;
  autoTradeEnabled: boolean;
}

export interface CustomCondition {
  id: string;
  indicator: 'rsi' | 'macd' | 'sma' | 'ema' | 'price';
  operator: '<' | '>' | '=' | 'crossover' | 'crossunder';
  value: number;
  period?: number;
  action: 'buy' | 'sell';
}

export interface TradeHistoryItem {
  id: string;
  timestamp: number;
  chainId: number;
  chainName: string;
  type: 'buy' | 'sell';
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  txHash: string;
  gasCost: string;
  gasCostUsd: number;
  profit?: number;
  blockExplorerUrl: string;
}

interface TradingSettingsProps {
  config: TradingConfig;
  onConfigChange: (config: TradingConfig) => void;
  tradeHistory: TradeHistoryItem[];
  currentChain: ChainConfig | undefined;
  nativeTokenPrice: number;
  onSwitchChain: (chainId: number) => Promise<void>;
  onEmergencyStop: () => void;
  dailyPnL: number;
  isTrading: boolean;
}

const DEFAULT_CONFIG: TradingConfig = {
  selectedChainId: 56, // Default to BSC (cheaper)
  useTestnet: false,
  botMode: 'manual',
  strategy: 'spot',
  tradingInterval: '1h',
  slippagePercent: 0.5,
  maxPositionPercent: 25,
  maxDailyLossPercent: 10,
  maxGasPercent: 5,
  gridLevels: 5,
  gridSpreadPercent: 2,
  dcaAmount: 100,
  dcaEnabled: false,
  arbitrageMinSpread: 0.5,
  arbitrageDexes: ['uniswap', 'sushiswap', 'pancakeswap'],
  customConditions: [],
  autoPauseOnHighGas: true,
  gasThresholdGwei: 50,
  autoTradeEnabled: false
};

export const getDefaultConfig = (): TradingConfig => {
  const saved = localStorage.getItem('tradingConfig');
  if (saved) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
};

export const TradingSettings: React.FC<TradingSettingsProps> = ({
  config,
  onConfigChange,
  tradeHistory,
  currentChain,
  nativeTokenPrice,
  onSwitchChain,
  onEmergencyStop,
  dailyPnL,
  isTrading
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'history' | 'safety'>('settings');

  // Save config to localStorage
  useEffect(() => {
    localStorage.setItem('tradingConfig', JSON.stringify(config));
  }, [config]);

  // Get available chains based on testnet toggle
  const availableChains = getAllChains(config.useTestnet);

  // Calculate estimated gas cost in USD
  const estimateGasCostUsd = (chainId: number): number => {
    const gasEstimate = CHAIN_GAS_ESTIMATES[chainId];
    if (!gasEstimate) return 0;

    const gasCostNative = (gasEstimate.swapGas * gasEstimate.avgGasPrice) / 1e9;
    return gasCostNative * nativeTokenPrice;
  };

  // Check if daily loss limit exceeded
  const isDailyLossExceeded = dailyPnL < 0 &&
    Math.abs(dailyPnL) > (config.maxDailyLossPercent / 100) * 1000; // Assuming $1000 base

  // Handle chain selection
  const handleChainSelect = async (chainId: number) => {
    onConfigChange({ ...config, selectedChainId: chainId });
    await onSwitchChain(chainId);
  };

  return (
    <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-accent" />
          <span className="text-white font-medium">Trading Settings</span>
          {config.useTestnet && (
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
              TESTNET
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-gray-800"
        >
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            {[
              { id: 'settings', label: 'Settings', icon: Settings },
              { id: 'safety', label: 'Safety', icon: Shield },
              { id: 'history', label: 'History', icon: History }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 px-4 py-2 flex items-center justify-center gap-2 text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'text-accent border-b-2 border-accent bg-accent/5'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-4">
                {/* Bot Mode Selector */}
                <div>
                  <label className="block text-gray-400 text-xs mb-2">Bot Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'manual', label: 'Manual', desc: 'Click to trade' },
                      { id: 'auto', label: 'Auto', desc: 'Trades at intervals' },
                      { id: 'signals', label: 'Signals', desc: 'Alerts only' }
                    ].map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => onConfigChange({ ...config, botMode: mode.id as any })}
                        className={`p-2 rounded-lg border text-center transition-all ${
                          config.botMode === mode.id
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <p className="text-sm font-medium">{mode.label}</p>
                        <p className="text-xs opacity-70">{mode.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Trading Strategy Selector */}
                <div>
                  <label className="block text-gray-400 text-xs mb-2">Strategy</label>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[
                      { id: 'spot', label: 'Spot', desc: 'Buy/Sell swaps' },
                      { id: 'grid', label: 'Grid', desc: 'Price levels' },
                      { id: 'dca', label: 'DCA', desc: 'Auto-buy intervals' }
                    ].map(strat => (
                      <button
                        key={strat.id}
                        onClick={() => onConfigChange({ ...config, strategy: strat.id as any })}
                        className={`p-2 rounded-lg border text-center transition-all ${
                          config.strategy === strat.id
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <p className="text-sm font-medium">{strat.label}</p>
                        <p className="text-xs opacity-70">{strat.desc}</p>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'arbitrage', label: 'Arbitrage', desc: 'Multi-DEX spreads' },
                      { id: 'custom', label: 'Custom', desc: 'Build your own' }
                    ].map(strat => (
                      <button
                        key={strat.id}
                        onClick={() => onConfigChange({ ...config, strategy: strat.id as any })}
                        className={`p-2 rounded-lg border text-center transition-all ${
                          config.strategy === strat.id
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <p className="text-sm font-medium">{strat.label}</p>
                        <p className="text-xs opacity-70">{strat.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Trading Interval Selector - Only show for Auto mode */}
                {config.botMode === 'auto' && (
                  <div>
                    <label className="block text-gray-400 text-xs mb-2">Trading Interval</label>
                    <div className="grid grid-cols-5 gap-2">
                      {(['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '24h'] as const).map(interval => (
                        <button
                          key={interval}
                          onClick={() => onConfigChange({ ...config, tradingInterval: interval })}
                          className={`px-2 py-2 rounded-lg text-sm transition-colors ${
                            config.tradingInterval === interval
                              ? 'bg-accent text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {interval}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grid Settings - Only show for Grid strategy */}
                {config.strategy === 'grid' && (
                  <div className="p-3 bg-background rounded-lg space-y-3">
                    <p className="text-white text-sm font-medium">Grid Settings</p>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">
                        Grid Levels: {config.gridLevels}
                      </label>
                      <input
                        type="range"
                        min="3"
                        max="20"
                        value={config.gridLevels}
                        onChange={(e) => onConfigChange({ ...config, gridLevels: parseInt(e.target.value) })}
                        className="w-full accent-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">
                        Spread: {config.gridSpreadPercent}%
                      </label>
                      <input
                        type="range"
                        min="0.5"
                        max="10"
                        step="0.5"
                        value={config.gridSpreadPercent}
                        onChange={(e) => onConfigChange({ ...config, gridSpreadPercent: parseFloat(e.target.value) })}
                        className="w-full accent-accent"
                      />
                    </div>
                  </div>
                )}

                {/* DCA Settings - Only show for DCA strategy */}
                {config.strategy === 'dca' && (
                  <div className="p-3 bg-background rounded-lg space-y-3">
                    <p className="text-white text-sm font-medium">DCA Settings</p>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">
                        Amount per buy: ${config.dcaAmount}
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="1000"
                        step="10"
                        value={config.dcaAmount}
                        onChange={(e) => onConfigChange({ ...config, dcaAmount: parseInt(e.target.value) })}
                        className="w-full accent-accent"
                      />
                    </div>
                  </div>
                )}

                {/* Arbitrage Settings - Only show for Arbitrage strategy */}
                {config.strategy === 'arbitrage' && (
                  <div className="p-3 bg-background rounded-lg space-y-3">
                    <p className="text-white text-sm font-medium">Arbitrage Settings</p>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">
                        Min Spread to Execute: {config.arbitrageMinSpread}%
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="5"
                        step="0.1"
                        value={config.arbitrageMinSpread}
                        onChange={(e) => onConfigChange({ ...config, arbitrageMinSpread: parseFloat(e.target.value) })}
                        className="w-full accent-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs mb-2">DEXes to Scan</label>
                      <div className="flex flex-wrap gap-2">
                        {['uniswap', 'sushiswap', 'pancakeswap', 'quickswap', 'curve'].map(dex => (
                          <button
                            key={dex}
                            onClick={() => {
                              const dexes = config.arbitrageDexes.includes(dex)
                                ? config.arbitrageDexes.filter(d => d !== dex)
                                : [...config.arbitrageDexes, dex];
                              onConfigChange({ ...config, arbitrageDexes: dexes });
                            }}
                            className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                              config.arbitrageDexes.includes(dex)
                                ? 'bg-accent text-white'
                                : 'bg-gray-700 text-gray-400'
                            }`}
                          >
                            {dex}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-yellow-400 text-xs flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Requires fast execution. High gas on Ethereum.
                    </p>
                  </div>
                )}

                {/* Custom Strategy Settings */}
                {config.strategy === 'custom' && (
                  <div className="p-3 bg-background rounded-lg space-y-3">
                    <p className="text-white text-sm font-medium">Custom Strategy Builder</p>
                    <p className="text-gray-400 text-xs">Set conditions for automated trading</p>

                    {config.customConditions.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-gray-500 text-sm mb-2">No conditions set</p>
                        <button
                          onClick={() => {
                            const newCondition: any = {
                              id: Math.random().toString(36).substr(2, 9),
                              indicator: 'rsi',
                              operator: '<',
                              value: 30,
                              period: 14,
                              action: 'buy'
                            };
                            onConfigChange({
                              ...config,
                              customConditions: [...config.customConditions, newCondition]
                            });
                          }}
                          className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg"
                        >
                          + Add Condition
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {config.customConditions.map((cond, idx) => (
                          <div key={cond.id} className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
                            <span className="text-gray-400 text-xs">IF</span>
                            <select
                              value={cond.indicator}
                              onChange={(e) => {
                                const updated = [...config.customConditions];
                                updated[idx] = { ...cond, indicator: e.target.value as any };
                                onConfigChange({ ...config, customConditions: updated });
                              }}
                              className="bg-gray-700 text-white text-xs px-2 py-1 rounded"
                            >
                              <option value="rsi">RSI</option>
                              <option value="sma">SMA</option>
                              <option value="ema">EMA</option>
                              <option value="price">Price</option>
                            </select>
                            <select
                              value={cond.operator}
                              onChange={(e) => {
                                const updated = [...config.customConditions];
                                updated[idx] = { ...cond, operator: e.target.value as any };
                                onConfigChange({ ...config, customConditions: updated });
                              }}
                              className="bg-gray-700 text-white text-xs px-2 py-1 rounded"
                            >
                              <option value="<">&lt;</option>
                              <option value=">">&gt;</option>
                              <option value="crossover">crosses above</option>
                              <option value="crossunder">crosses below</option>
                            </select>
                            <input
                              type="number"
                              value={cond.value}
                              onChange={(e) => {
                                const updated = [...config.customConditions];
                                updated[idx] = { ...cond, value: parseFloat(e.target.value) };
                                onConfigChange({ ...config, customConditions: updated });
                              }}
                              className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-16"
                            />
                            <span className="text-gray-400 text-xs">THEN</span>
                            <select
                              value={cond.action}
                              onChange={(e) => {
                                const updated = [...config.customConditions];
                                updated[idx] = { ...cond, action: e.target.value as any };
                                onConfigChange({ ...config, customConditions: updated });
                              }}
                              className={`text-xs px-2 py-1 rounded ${
                                cond.action === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              <option value="buy">BUY</option>
                              <option value="sell">SELL</option>
                            </select>
                            <button
                              onClick={() => {
                                onConfigChange({
                                  ...config,
                                  customConditions: config.customConditions.filter(c => c.id !== cond.id)
                                });
                              }}
                              className="text-red-400 hover:text-red-300 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const newCondition: any = {
                              id: Math.random().toString(36).substr(2, 9),
                              indicator: 'rsi',
                              operator: '>',
                              value: 70,
                              action: 'sell'
                            };
                            onConfigChange({
                              ...config,
                              customConditions: [...config.customConditions, newCondition]
                            });
                          }}
                          className="w-full px-3 py-1.5 border border-dashed border-gray-600 text-gray-400 text-sm rounded-lg hover:border-accent hover:text-accent"
                        >
                          + Add Another Condition
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Testnet Toggle */}
                <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                  <div className="flex items-center gap-2">
                    <TestTube className="w-4 h-4 text-yellow-400" />
                    <span className="text-white text-sm">Testnet Mode</span>
                  </div>
                  <button
                    onClick={() => onConfigChange({ ...config, useTestnet: !config.useTestnet })}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      config.useTestnet ? 'bg-yellow-500' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      config.useTestnet ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                {/* Chain Selector */}
                <div>
                  <label className="block text-gray-400 text-xs mb-2">Select Network</label>
                  <div className="grid grid-cols-2 gap-2">
                    {availableChains.slice(0, 6).map(chain => {
                      const gasCost = estimateGasCostUsd(chain.id);
                      const isSelected = config.selectedChainId === chain.id;
                      const isTest = isTestnet(chain.id);

                      return (
                        <button
                          key={chain.id}
                          onClick={() => handleChainSelect(chain.id)}
                          className={`p-3 rounded-lg border transition-all text-left ${
                            isSelected
                              ? 'border-accent bg-accent/10'
                              : 'border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-medium ${isSelected ? 'text-accent' : 'text-white'}`}>
                              {chain.shortName}
                            </span>
                            {isTest && (
                              <span className="text-xs text-yellow-400">TEST</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Flame className="w-3 h-3" />
                            <span>~${gasCost.toFixed(2)} gas</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Slippage Control */}
                <div>
                  <label className="block text-gray-400 text-xs mb-2">
                    Slippage Tolerance: {config.slippagePercent}%
                  </label>
                  <div className="flex gap-2">
                    {[0.1, 0.5, 1.0, 2.0, 5.0].map(value => (
                      <button
                        key={value}
                        onClick={() => onConfigChange({ ...config, slippagePercent: value })}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          config.slippagePercent === value
                            ? 'bg-accent text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {value}%
                      </button>
                    ))}
                  </div>
                  {config.slippagePercent > 2 && (
                    <p className="text-yellow-400 text-xs mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      High slippage may result in unfavorable trades
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Safety Tab */}
            {activeTab === 'safety' && (
              <div className="space-y-4">
                {/* Emergency Stop */}
                <button
                  onClick={onEmergencyStop}
                  disabled={!isTrading}
                  className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                    isTrading
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <Pause className="w-5 h-5" />
                  Emergency Stop All Trades
                </button>

                {/* Daily Loss Warning */}
                {isDailyLossExceeded && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">Daily Loss Limit Exceeded</span>
                    </div>
                    <p className="text-gray-400 text-sm mt-1">
                      Trading automatically paused. Current loss: ${Math.abs(dailyPnL).toFixed(2)}
                    </p>
                  </div>
                )}

                {/* Max Position Size */}
                <div>
                  <label className="block text-gray-400 text-xs mb-2">
                    Max Position Size: {config.maxPositionPercent}% of balance
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={config.maxPositionPercent}
                    onChange={(e) => onConfigChange({
                      ...config,
                      maxPositionPercent: parseInt(e.target.value)
                    })}
                    className="w-full accent-accent"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>5%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Max Daily Loss */}
                <div>
                  <label className="block text-gray-400 text-xs mb-2">
                    Max Daily Loss: {config.maxDailyLossPercent}%
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={config.maxDailyLossPercent}
                    onChange={(e) => onConfigChange({
                      ...config,
                      maxDailyLossPercent: parseInt(e.target.value)
                    })}
                    className="w-full accent-accent"
                  />
                </div>

                {/* Gas Warning Threshold */}
                <div>
                  <label className="block text-gray-400 text-xs mb-2">
                    Warn if gas exceeds: {config.maxGasPercent}% of trade
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={config.maxGasPercent}
                    onChange={(e) => onConfigChange({
                      ...config,
                      maxGasPercent: parseInt(e.target.value)
                    })}
                    className="w-full accent-accent"
                  />
                </div>

                {/* Auto-pause on high gas */}
                <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-white text-sm">Auto-pause on high gas</span>
                  </div>
                  <button
                    onClick={() => onConfigChange({
                      ...config,
                      autoPauseOnHighGas: !config.autoPauseOnHighGas
                    })}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      config.autoPauseOnHighGas ? 'bg-accent' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      config.autoPauseOnHighGas ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {tradeHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">No trades yet</p>
                  </div>
                ) : (
                  tradeHistory.slice(0, 20).map(trade => (
                    <div
                      key={trade.id}
                      className="p-3 bg-background rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            trade.type === 'buy'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {trade.type.toUpperCase()}
                          </span>
                          <span className="text-white text-sm">
                            {trade.amountIn} → {trade.amountOut}
                          </span>
                        </div>
                        <a
                          href={trade.blockExplorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:text-accent-hover"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{trade.chainName}</span>
                        <span>Gas: ${trade.gasCostUsd.toFixed(2)}</span>
                        {trade.profit !== undefined && (
                          <span className={trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {new Date(trade.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default TradingSettings;
