import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Lock, Zap, Crown, Rocket, Check, Play, Square, Clock, Users, Wallet, ArrowUp, ArrowDown, ZoomIn, ZoomOut, TrendingUp, TrendingDown, Activity, ExternalLink, RefreshCw, AlertCircle, Loader2, Settings, Pause, TestTube, History, Timer, Bell } from 'lucide-react';
import { useWeb3, RealSwapResult } from '../../contexts/Web3Context';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAppKit } from '@reown/appkit/react';
import { SUPPORTED_CHAINS, TESTNET_CHAINS, getChainById, getAllChains, isTestnet, CHAIN_GAS_ESTIMATES } from '../../lib/chains';
import { parseUnits, formatUnits } from 'viem';
import { TradingSettings, GasEstimator, getDefaultConfig, TradingConfig, TradeHistoryItem } from '../../components/trading';
import { verifyTrade } from '../../lib/api/subscription';

interface TradingPair {
  symbol: string;
  binanceSymbol: string;
  name: string;
  price: number;
  change: number;
  decimals: number;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TopPerformerTrade {
  id: string;
  wallet: string;
  pair: string;
  amount: number;
  profit: number;
  chain: string;
  time: Date;
}

interface Strategy {
  direction: 'LONG' | 'SHORT';
  confidence: number;
  reason: string;
  indicators: string[];
}

interface ActiveTrade {
  id: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  amount: number;
  tokenAmount: string;
  startTime: Date;
  txHash: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  gasCost: string;
}

const tradingPairs: TradingPair[] = [
  { symbol: 'ETH/USDT', binanceSymbol: 'ETHUSDT', name: 'Ethereum', price: 0, change: 0, decimals: 18 },
  { symbol: 'BTC/USDT', binanceSymbol: 'BTCUSDT', name: 'Bitcoin', price: 0, change: 0, decimals: 8 },
  { symbol: 'BNB/USDT', binanceSymbol: 'BNBUSDT', name: 'BNB', price: 0, change: 0, decimals: 18 },
  { symbol: 'MATIC/USDT', binanceSymbol: 'MATICUSDT', name: 'Polygon', price: 0, change: 0, decimals: 18 },
  { symbol: 'ARB/USDT', binanceSymbol: 'ARBUSDT', name: 'Arbitrum', price: 0, change: 0, decimals: 18 },
];

const generateWallet = () => {
  const chars = '0123456789abcdef';
  let addr = '0x';
  for (let i = 0; i < 6; i++) addr += chars[Math.floor(Math.random() * 16)];
  addr += '...';
  for (let i = 0; i < 4; i++) addr += chars[Math.floor(Math.random() * 16)];
  return addr;
};

const generateTopPerformerTrade = (pairs: TradingPair[]): TopPerformerTrade => {
  const chains = ['ETH', 'BSC', 'ARB', 'BASE', 'MATIC'];
  const chain = chains[Math.floor(Math.random() * chains.length)];
  const amount = Math.floor(Math.random() * 5000) + 100;
  const profitPercent = (Math.random() - 0.3) * 20;

  return {
    id: Math.random().toString(36).substring(2, 11),
    wallet: generateWallet(),
    pair: pairs[Math.floor(Math.random() * pairs.length)].symbol,
    amount,
    profit: amount * (profitPercent / 100),
    chain,
    time: new Date()
  };
};

const TradingBotPage: React.FC = () => {
  const { open } = useAppKit();
  const {
    isConnected,
    address,
    currentChain,
    nativeBalance,
    tokenBalances,
    totalUsdValue,
    isLoadingBalances,
    refreshBalances,
    switchChain,
    executeRealSwap,
    dexRouter
  } = useWeb3();
  const { activeSubscription } = useSubscription();
  const { addNotification } = useNotifications();

  const [showPlans, setShowPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [botActive, setBotActive] = useState(false);
  const [tradeAmount, setTradeAmount] = useState(100);
  const [pairs, setPairs] = useState<TradingPair[]>(tradingPairs);
  const [selectedPair, setSelectedPair] = useState<TradingPair>(tradingPairs[0]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [topPerformers, setTopPerformers] = useState<TopPerformerTrade[]>([]);
  const [botStartTime, setBotStartTime] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [entryPrice, setEntryPrice] = useState(0);
  const [currentPnL, setCurrentPnL] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('5m');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [activeTrade, setActiveTrade] = useState<ActiveTrade | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // New trading config state
  const [tradingConfig, setTradingConfig] = useState<TradingConfig>(getDefaultConfig);
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryItem[]>([]);
  const [dailyPnL, setDailyPnL] = useState(0);
  const [nativeTokenPrice, setNativeTokenPrice] = useState(0);
  const [expectedOutput, setExpectedOutput] = useState(0);
  const [priceImpact, setPriceImpact] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [hasGasWarning, setHasGasWarning] = useState(false);
  const [autoTradeTimer, setAutoTradeTimer] = useState<NodeJS.Timeout | null>(null);
  const [nextAutoTradeIn, setNextAutoTradeIn] = useState(0);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const [showRiskWarning, setShowRiskWarning] = useState(false);
  const [sessionTradeCount, setSessionTradeCount] = useState(0);
  const [pendingReopen, setPendingReopen] = useState(false);

  const MIN_TRADE_TIME = 15 * 60;

  const planTiers = [
    {
      id: 'starter',
      name: 'Starter',
      price: 99,
      priceToken: '0.05 ETH',
      icon: <Zap className="w-8 h-8" />,
      color: 'from-gray-600 to-gray-700',
      features: ['Up to $1,000 per trade', 'Basic pairs', '5 trades/day']
    },
    {
      id: 'pro',
      name: 'Professional',
      price: 199,
      priceToken: '0.1 ETH',
      icon: <Crown className="w-8 h-8" />,
      color: 'from-gray-400 to-gray-500',
      popular: true,
      features: ['Up to $5,000 per trade', 'All pairs', '50 trades/day', 'Priority execution']
    },
    {
      id: 'elite',
      name: 'Elite',
      price: 699,
      priceToken: '0.35 ETH',
      icon: <Rocket className="w-8 h-8" />,
      color: 'from-white to-gray-300',
      features: ['Up to $10,000 per trade', 'All pairs', 'Unlimited trades', 'MEV protection']
    }
  ];

  // Get available balance (USDT/USDC from wallet)
  const availableBalance = useMemo(() => {
    const stables = tokenBalances.filter(t =>
      t.symbol === 'USDT' || t.symbol === 'USDC'
    );
    return stables.reduce((sum, t) => sum + parseFloat(t.balance), 0);
  }, [tokenBalances]);

  // Analyze market
  const analyzeMarket = useMemo(() => {
    if (candles.length < 20) return null;

    const recentCandles = candles.slice(-20);
    const closes = recentCandles.map(c => c.close);

    const sma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const sma10 = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const sma20 = closes.reduce((a, b) => a + b, 0) / 20;

    let gains = 0, losses = 0;
    for (let i = 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    const bullishCandles = recentCandles.filter(c => c.close > c.open).length;
    const bearishCandles = recentCandles.filter(c => c.close < c.open).length;

    const indicators: string[] = [];
    let bullishSignals = 0;
    let bearishSignals = 0;

    if (sma5 > sma10 && sma10 > sma20) {
      indicators.push('SMA Bullish');
      bullishSignals += 2;
    } else if (sma5 < sma10 && sma10 < sma20) {
      indicators.push('SMA Bearish');
      bearishSignals += 2;
    }

    if (rsi < 30) {
      indicators.push('RSI Oversold');
      bullishSignals += 2;
    } else if (rsi > 70) {
      indicators.push('RSI Overbought');
      bearishSignals += 2;
    }

    if (bullishCandles > bearishCandles * 1.5) {
      indicators.push('Bullish Momentum');
      bullishSignals += 2;
    } else if (bearishCandles > bullishCandles * 1.5) {
      indicators.push('Bearish Momentum');
      bearishSignals += 2;
    }

    const direction: 'LONG' | 'SHORT' = bullishSignals > bearishSignals ? 'LONG' : 'SHORT';
    const totalSignals = bullishSignals + bearishSignals;
    const confidence = Math.min(95, Math.max(55, (Math.max(bullishSignals, bearishSignals) / totalSignals) * 100));

    return {
      direction,
      confidence: Math.round(confidence),
      reason: direction === 'LONG'
        ? 'Bullish signals detected'
        : 'Bearish signals detected',
      indicators
    };
  }, [candles]);

  // Fetch candles
  const fetchCandles = async (symbol: string, interval: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`
      );
      const data = await response.json();
      const candleData: Candle[] = data.map((item: any[]) => ({
        time: item[0],
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5])
      }));
      setCandles(candleData);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching candles:', error);
      setIsLoading(false);
    }
  };

  // Fetch prices
  const fetchPrices = async () => {
    try {
      const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
      const data = await response.json();
      setPairs(prev => prev.map(pair => {
        const ticker = data.find((t: any) => t.symbol === pair.binanceSymbol);
        if (ticker) {
          return {
            ...pair,
            price: parseFloat(ticker.lastPrice),
            change: parseFloat(ticker.priceChangePercent)
          };
        }
        return pair;
      }));
      setSelectedPair(prev => {
        const ticker = data.find((t: any) => t.symbol === prev.binanceSymbol);
        if (ticker) {
          return { ...prev, price: parseFloat(ticker.lastPrice), change: parseFloat(ticker.priceChangePercent) };
        }
        return prev;
      });
    } catch (error) {
      console.error('Error fetching prices:', error);
    }
  };

  useEffect(() => {
    fetchPrices();
    fetchCandles(selectedPair.binanceSymbol, timeframe);
    const initial: TopPerformerTrade[] = [];
    for (let i = 0; i < 8; i++) {
      initial.push({ ...generateTopPerformerTrade(tradingPairs), time: new Date(Date.now() - Math.random() * 300000) });
    }
    setTopPerformers(initial.sort((a, b) => b.time.getTime() - a.time.getTime()));
  }, []);

  useEffect(() => {
    fetchCandles(selectedPair.binanceSymbol, timeframe);
  }, [selectedPair.binanceSymbol, timeframe]);

  // Fetch native token prices for gas estimation
  useEffect(() => {
    const fetchNativePrice = async () => {
      try {
        const symbols = ['ETHUSDT', 'BNBUSDT', 'MATICUSDT'];
        const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbols=' + JSON.stringify(symbols));
        const data = await response.json();
        // Get ETH price as default, adjust based on chain
        const ethPrice = data.find((t: any) => t.symbol === 'ETHUSDT')?.price || 2000;
        const bnbPrice = data.find((t: any) => t.symbol === 'BNBUSDT')?.price || 300;
        const maticPrice = data.find((t: any) => t.symbol === 'MATICUSDT')?.price || 0.5;

        // Set price based on current chain
        if (currentChain) {
          if (currentChain.nativeCurrency.symbol === 'BNB') {
            setNativeTokenPrice(parseFloat(bnbPrice));
          } else if (currentChain.nativeCurrency.symbol === 'MATIC') {
            setNativeTokenPrice(parseFloat(maticPrice));
          } else {
            setNativeTokenPrice(parseFloat(ethPrice));
          }
        }
      } catch (error) {
        console.error('Error fetching native prices:', error);
        setNativeTokenPrice(2000); // Default ETH price
      }
    };
    fetchNativePrice();
    const interval = setInterval(fetchNativePrice, 30000);
    return () => clearInterval(interval);
  }, [currentChain]);

  // Load trade history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tradeHistory');
    if (saved) {
      try {
        setTradeHistory(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // Calculate expected output when trade amount changes
  useEffect(() => {
    if (tradeAmount > 0 && selectedPair.price > 0) {
      const output = tradeAmount / selectedPair.price;
      setExpectedOutput(output);
      // Estimate price impact based on trade size (simplified)
      const impactPercent = Math.min((tradeAmount / 100000) * 100, 10);
      setPriceImpact(impactPercent);
    }
  }, [tradeAmount, selectedPair.price]);

  // Convert interval string to milliseconds
  const intervalToMs = (interval: string): number => {
    const map: Record<string, number> = {
      '1m': 1 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000
    };
    return map[interval] || 60 * 60 * 1000;
  };

  // Calculate estimated trading costs
  const estimatedCosts = useMemo(() => {
    const gasEstimate = CHAIN_GAS_ESTIMATES[tradingConfig.selectedChainId] || { swapGas: 150000, avgGasPrice: 10 };
    const gasCostPerTrade = (gasEstimate.swapGas * gasEstimate.avgGasPrice / 1e9) * nativeTokenPrice;
    const intervalMs = intervalToMs(tradingConfig.tradingInterval);
    const tradesPerDay = (24 * 60 * 60 * 1000) / intervalMs;
    const dailyGasCost = gasCostPerTrade * tradesPerDay * 2; // x2 for open + close
    const gasPercentage = tradeAmount > 0 ? (gasCostPerTrade / tradeAmount) * 100 : 0;

    return {
      gasCostPerTrade,
      tradesPerDay,
      dailyGasCost,
      gasPercentage
    };
  }, [tradingConfig.selectedChainId, tradingConfig.tradingInterval, nativeTokenPrice, tradeAmount]);

  // Auto-trade interval logic
  useEffect(() => {
    // Clear any existing timer
    if (autoTradeTimer) {
      clearInterval(autoTradeTimer);
      setAutoTradeTimer(null);
    }

    // Only run auto-trade if in auto mode, connected, has subscription, and not already trading
    if (
      tradingConfig.botMode === 'auto' &&
      tradingConfig.autoTradeEnabled &&
      isConnected &&
      activeSubscription &&
      !botActive &&
      analyzeMarket
    ) {
      const intervalMs = intervalToMs(tradingConfig.tradingInterval);
      setNextAutoTradeIn(intervalMs / 1000);

      // Countdown timer
      const countdownTimer = setInterval(() => {
        setNextAutoTradeIn(prev => {
          if (prev <= 1) {
            // Time to execute trade
            handleStartBot();
            return intervalMs / 1000;
          }
          return prev - 1;
        });
      }, 1000);

      setAutoTradeTimer(countdownTimer);

      return () => {
        clearInterval(countdownTimer);
      };
    }
  }, [
    tradingConfig.botMode,
    tradingConfig.autoTradeEnabled,
    tradingConfig.tradingInterval,
    isConnected,
    activeSubscription,
    botActive
  ]);

  // Emergency stop handler
  const handleEmergencyStop = useCallback(() => {
    if (botActive && activeTrade) {
      // Force close the trade
      handleStopBot();
    }
    // Also stop auto-trading
    if (autoTradeTimer) {
      clearInterval(autoTradeTimer);
      setAutoTradeTimer(null);
    }
    setTradingConfig(prev => ({ ...prev, autoTradeEnabled: false }));
    setBotActive(false);
    setActiveTrade(null);
    setStrategy(null);
  }, [botActive, activeTrade, autoTradeTimer]);

  // Add trade to history
  const addTradeToHistory = useCallback((trade: TradeHistoryItem) => {
    setTradeHistory(prev => {
      const updated = [trade, ...prev].slice(0, 100); // Keep last 100 trades
      localStorage.setItem('tradeHistory', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Handle chain switch from TradingSettings
  const handleSwitchChain = useCallback(async (chainId: number) => {
    try {
      await switchChain(chainId);
    } catch (error) {
      console.error('Failed to switch chain:', error);
    }
  }, [switchChain]);

  // Get current chain config for TradingSettings
  const currentChainConfig = useMemo(() => {
    if (!currentChain) return undefined;
    return getChainById(currentChain.id);
  }, [currentChain]);

  useEffect(() => {
    const interval = setInterval(fetchPrices, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => fetchCandles(selectedPair.binanceSymbol, timeframe), 10000);
    return () => clearInterval(interval);
  }, [selectedPair.binanceSymbol, timeframe]);

  useEffect(() => {
    const addTrade = () => {
      setTopPerformers(prev => [generateTopPerformerTrade(pairs), ...prev.slice(0, 19)]);
    };
    const scheduleNext = () => {
      const delay = Math.floor(Math.random() * 15000) + 5000;
      return setTimeout(() => { addTrade(); timeoutId = scheduleNext(); }, delay);
    };
    let timeoutId = scheduleNext();
    return () => clearTimeout(timeoutId);
  }, [pairs]);

  // Update PnL
  useEffect(() => {
    if (!botActive || entryPrice === 0 || !strategy) return;
    const currentPrice = candles[candles.length - 1]?.close || selectedPair.price;
    let priceChange: number;
    if (strategy.direction === 'LONG') {
      priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
      priceChange = ((entryPrice - currentPrice) / entryPrice) * 100;
    }
    setCurrentPnL(tradeAmount * (priceChange / 100));
  }, [candles, botActive, entryPrice, tradeAmount, selectedPair.price, strategy]);

  // Auto-close on Take Profit or Stop Loss
  useEffect(() => {
    if (!botActive || !activeTrade || entryPrice === 0 || timeRemaining > 0 || isExecuting) return;

    const currentPrice = candles[candles.length - 1]?.close || selectedPair.price;
    let priceChangePercent: number;
    if (strategy?.direction === 'LONG') {
      priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
      priceChangePercent = ((entryPrice - currentPrice) / entryPrice) * 100;
    }

    // Check Take Profit
    if (tradingConfig.takeProfitEnabled && priceChangePercent >= tradingConfig.takeProfitPercent) {
      console.log(`Take Profit triggered at ${priceChangePercent.toFixed(2)}%`);
      addNotification({
        type: 'take_profit',
        title: 'Take Profit Triggered',
        message: `${selectedPair.symbol} hit +${priceChangePercent.toFixed(1)}% target. Auto-closing position.`,
        data: { profit: currentPnL, pair: selectedPair.symbol }
      });
      setPendingReopen(tradingConfig.autoReopenEnabled);
      handleStopBot();
      return;
    }

    // Check Stop Loss
    if (tradingConfig.stopLossEnabled && priceChangePercent <= -tradingConfig.stopLossPercent) {
      console.log(`Stop Loss triggered at ${priceChangePercent.toFixed(2)}%`);
      addNotification({
        type: 'stop_loss',
        title: 'Stop Loss Triggered',
        message: `${selectedPair.symbol} hit ${priceChangePercent.toFixed(1)}% stop. Auto-closing position.`,
        data: { profit: currentPnL, pair: selectedPair.symbol }
      });
      setPendingReopen(tradingConfig.autoReopenEnabled && tradingConfig.autoReopenOnLoss);
      handleStopBot();
      return;
    }
  }, [currentPnL, botActive, activeTrade, entryPrice, timeRemaining, isExecuting, tradingConfig, candles, selectedPair.price, strategy]);

  // Auto-reopen after closing in profit
  useEffect(() => {
    if (!pendingReopen || botActive || isExecuting) return;

    // Check if we've hit max trades for session
    if (tradingConfig.maxTradesPerSession > 0 && sessionTradeCount >= tradingConfig.maxTradesPerSession) {
      console.log('Max trades per session reached, not reopening');
      setPendingReopen(false);
      return;
    }

    // Wait for a good signal before reopening
    if (analyzeMarket && analyzeMarket.confidence >= 60) {
      console.log('Auto-reopening trade...');
      setPendingReopen(false);
      // Small delay before reopening
      setTimeout(() => {
        if (!botActive && !isExecuting) {
          handleStartBot();
        }
      }, 2000);
    }
  }, [pendingReopen, botActive, isExecuting, analyzeMarket, sessionTradeCount, tradingConfig.maxTradesPerSession]);

  // Timer
  useEffect(() => {
    if (!botActive || !botStartTime) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - botStartTime.getTime()) / 1000);
      setTimeRemaining(Math.max(MIN_TRADE_TIME - elapsed, 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [botActive, botStartTime]);

  const handleStartBot = async () => {
    if (!isConnected) {
      open();
      return;
    }

    if (!activeSubscription) {
      setShowPlans(true);
      return;
    }

    if (tradeAmount > availableBalance) {
      alert('Insufficient balance. Please add funds to your wallet.');
      return;
    }

    // Check max position size
    const maxPosition = availableBalance * (tradingConfig.maxPositionPercent / 100);
    if (tradeAmount > maxPosition) {
      alert(`Trade exceeds max position size. Maximum allowed: $${maxPosition.toFixed(2)} (${tradingConfig.maxPositionPercent}% of balance)`);
      return;
    }

    // Check daily loss limit
    if (dailyPnL < 0 && Math.abs(dailyPnL) > availableBalance * (tradingConfig.maxDailyLossPercent / 100)) {
      alert(`Daily loss limit exceeded. Trading paused until tomorrow.`);
      return;
    }

    // Warn about high gas if enabled
    if (hasGasWarning && !confirm('Gas cost is high relative to trade size. Continue anyway?')) {
      return;
    }

    if (!analyzeMarket || !currentChain) return;

    setIsExecuting(true);

    try {
      // Verify subscription allows this trade (server-side check)
      const isPaperTrade = isTestnet(currentChain.id);
      const verification = await verifyTrade(currentChain.id, isPaperTrade);

      if (!verification.allowed) {
        alert(verification.reason || 'Trade not allowed. Please check your subscription.');
        setIsExecuting(false);
        return;
      }

      // Show paper trading notice for free tier
      if (verification.isPaperOnly && !isPaperTrade) {
        alert('Free tier only supports paper trading. Please use a testnet or upgrade your plan.');
        setIsExecuting(false);
        return;
      }

      const currentPrice = candles[candles.length - 1]?.close || selectedPair.price;

      // Get token addresses from current chain
      const quoteToken = currentChain.tokens.usdt || currentChain.tokens.usdc;
      const baseToken = currentChain.tokens.weth || currentChain.tokens.wnative;

      if (!quoteToken || !baseToken) {
        throw new Error('Token addresses not configured for this chain');
      }

      // For LONG: Buy base token with quote token (e.g., buy ETH with USDT)
      // For SHORT: Sell base token for quote token (e.g., sell ETH for USDT)
      const tokenIn = analyzeMarket.direction === 'LONG' ? quoteToken : baseToken;
      const tokenOut = analyzeMarket.direction === 'LONG' ? baseToken : quoteToken;

      console.log(`Executing REAL ${analyzeMarket.direction} trade on ${currentChain.dex.name}`);
      console.log(`Swapping ${tradeAmount} of ${tokenIn} for ${tokenOut}`);
      console.log(`Slippage: ${tradingConfig.slippagePercent}%`);
      console.log(`Daily trades remaining: ${verification.dailyTradesRemaining}`);

      // Execute REAL swap on-chain with user's slippage setting
      const swapResult = await executeRealSwap(
        tokenIn,
        tokenOut,
        tradeAmount.toString(),
        tradingConfig.slippagePercent
      );

      console.log('Trade executed:', swapResult);

      const trade: ActiveTrade = {
        id: Math.random().toString(36).substring(2, 11),
        pair: selectedPair.symbol,
        direction: analyzeMarket.direction,
        entryPrice: currentPrice,
        amount: tradeAmount,
        tokenAmount: swapResult.amountOut,
        startTime: new Date(),
        txHash: swapResult.txHash,
        tokenIn,
        tokenOut,
        amountIn: swapResult.amountIn,
        amountOut: swapResult.amountOut,
        gasCost: swapResult.gasCost
      };

      setActiveTrade(trade);
      setEntryPrice(currentPrice);
      setCurrentPnL(0);
      setBotStartTime(new Date());
      setTimeRemaining(MIN_TRADE_TIME);
      setStrategy(analyzeMarket);
      setBotActive(true);
      setSessionTradeCount(prev => prev + 1);

      // Refresh wallet balances after trade
      await refreshBalances();
    } catch (error: any) {
      console.error('Error executing trade:', error);
      alert(`Trade failed: ${error.message || 'Please try again.'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleStopBot = async () => {
    if (timeRemaining > 0 || !activeTrade || !currentChain) return;

    setIsExecuting(true);

    try {
      console.log('Closing position - executing reverse swap');

      // Execute reverse swap to close position
      // Swap tokenOut back to tokenIn with user's slippage setting
      const swapResult = await executeRealSwap(
        activeTrade.tokenOut,  // Now selling what we bought
        activeTrade.tokenIn,   // Getting back original token
        activeTrade.amountOut, // Amount we received from opening trade
        tradingConfig.slippagePercent // Use config slippage
      );

      console.log('Position closed:', swapResult);

      // Calculate REAL profit/loss
      const amountReturned = parseFloat(swapResult.amountOut);
      const originalAmount = parseFloat(activeTrade.amountIn);
      const gasCostOpen = parseFloat(activeTrade.gasCost);
      const gasCostClose = parseFloat(swapResult.gasCost);
      const totalGasCost = gasCostOpen + gasCostClose;

      const realPnL = amountReturned - originalAmount;
      const netPnL = realPnL - totalGasCost;

      console.log(`Trade Result:
        Original: ${originalAmount}
        Returned: ${amountReturned}
        Gross P/L: ${realPnL}
        Gas Cost: ${totalGasCost}
        Net P/L: ${netPnL}
      `);

      // Add notification
      addNotification({
        type: netPnL >= 0 ? 'take_profit' : 'stop_loss',
        title: netPnL >= 0 ? 'Trade Closed in Profit' : 'Trade Closed in Loss',
        message: `${selectedPair.symbol} ${activeTrade.direction} closed. Net P/L: ${netPnL >= 0 ? '+' : ''}$${netPnL.toFixed(2)}`,
        data: {
          profit: netPnL,
          pair: selectedPair.symbol,
          txHash: swapResult.txHash
        }
      });

      // Add trade to history
      const historyItem: TradeHistoryItem = {
        id: activeTrade.id,
        timestamp: Date.now(),
        chainId: currentChain.id,
        chainName: currentChain.shortName,
        type: activeTrade.direction === 'LONG' ? 'buy' : 'sell',
        tokenIn: activeTrade.tokenIn.slice(0, 10) + '...',
        tokenOut: activeTrade.tokenOut.slice(0, 10) + '...',
        amountIn: activeTrade.amountIn,
        amountOut: swapResult.amountOut,
        txHash: swapResult.txHash,
        gasCost: totalGasCost.toFixed(6),
        gasCostUsd: totalGasCost * nativeTokenPrice,
        profit: netPnL,
        blockExplorerUrl: `${currentChain.blockExplorer}/tx/${swapResult.txHash}`
      };
      addTradeToHistory(historyItem);

      // Update daily PnL
      setDailyPnL(prev => prev + netPnL);

      setBotActive(false);
      setActiveTrade(null);
      setEntryPrice(0);
      setCurrentPnL(0);
      setBotStartTime(null);
      setStrategy(null);

      // Refresh wallet balances
      await refreshBalances();
    } catch (error: any) {
      console.error('Error closing trade:', error);
      alert(`Failed to close position: ${error.message || 'Please try again.'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handlePurchase = (planId: string) => {
    setSelectedPlan(planId);
    // In real implementation, this would trigger a crypto payment
    setShowPlans(false);
  };

  const getMaxAmount = () => {
    if (!activeSubscription) return 0;
    switch (activeSubscription.tier) {
      case 'starter': return Math.min(1000, availableBalance);
      case 'pro': return Math.min(5000, availableBalance);
      case 'elite': return Math.min(10000, availableBalance);
      default: return Math.min(1000, availableBalance);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPrice = (price: number, decimals: number = 2) => {
    return price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const chartHeight = 320;

  const renderCandlestickChart = () => {
    if (candles.length === 0 || isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="animate-pulse text-gray-500">Loading chart...</div>
        </div>
      );
    }

    const candlesToShow = Math.floor(60 / zoomLevel);
    const displayCandles = candles.slice(-candlesToShow);
    const prices = displayCandles.flatMap(c => [c.high, c.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    const padding = priceRange * 0.05;

    const scaleY = (price: number) => {
      return chartHeight - ((price - (minPrice - padding)) / (priceRange + padding * 2)) * chartHeight;
    };

    const candleWidth = Math.max(4, Math.floor((100 / displayCandles.length) * 8));

    return (
      <div className="relative w-full h-full overflow-hidden">
        <svg width="100%" height={chartHeight} className="overflow-visible">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const price = minPrice - padding + (priceRange + padding * 2) * (1 - ratio);
            const y = ratio * chartHeight;
            return (
              <g key={i}>
                <line x1="0" y1={y} x2="100%" y2={y} stroke="#374151" strokeWidth="0.5" strokeDasharray="4" />
                <text x="100%" y={y} dx="-4" dy="4" className="text-[10px] fill-gray-500" textAnchor="end">
                  ${formatPrice(price, 2)}
                </text>
              </g>
            );
          })}

          {displayCandles.map((candle, idx) => {
            const isGreen = candle.close >= candle.open;
            const x = (idx / displayCandles.length) * 100;
            const bodyTop = scaleY(Math.max(candle.open, candle.close));
            const bodyBottom = scaleY(Math.min(candle.open, candle.close));
            const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
            const wickTop = scaleY(candle.high);
            const wickBottom = scaleY(candle.low);
            const color = isGreen ? '#22c55e' : '#ef4444';

            return (
              <g key={idx}>
                <line
                  x1={`${x + (candleWidth / 2) / 8}%`}
                  y1={wickTop}
                  x2={`${x + (candleWidth / 2) / 8}%`}
                  y2={wickBottom}
                  stroke={color}
                  strokeWidth="1"
                />
                <rect
                  x={`${x}%`}
                  y={bodyTop}
                  width={`${candleWidth / 10}%`}
                  height={bodyHeight}
                  fill={color}
                  rx="1"
                />
              </g>
            );
          })}

          {botActive && entryPrice > 0 && (
            <g>
              <line
                x1="0"
                y1={scaleY(entryPrice)}
                x2="100%"
                y2={scaleY(entryPrice)}
                stroke={strategy?.direction === 'LONG' ? '#22c55e' : '#ef4444'}
                strokeWidth="1.5"
                strokeDasharray="6,3"
              />
              <rect
                x="0"
                y={scaleY(entryPrice) - 10}
                width="90"
                height="20"
                fill={strategy?.direction === 'LONG' ? '#22c55e' : '#ef4444'}
                rx="4"
              />
              <text x="45" y={scaleY(entryPrice) + 4} className="text-[10px] fill-white font-medium" textAnchor="middle">
                {strategy?.direction} ${formatPrice(entryPrice, 2)}
              </text>
            </g>
          )}

          {candles.length > 0 && (
            <g>
              <rect
                x="calc(100% - 75px)"
                y={scaleY(candles[candles.length - 1].close) - 10}
                width="70"
                height="20"
                fill={candles[candles.length - 1].close >= candles[candles.length - 1].open ? '#22c55e' : '#ef4444'}
                rx="4"
              />
              <text
                x="calc(100% - 40px)"
                y={scaleY(candles[candles.length - 1].close) + 4}
                className="text-[10px] fill-white font-medium"
                textAnchor="middle"
              >
                ${formatPrice(candles[candles.length - 1].close, 2)}
              </text>
            </g>
          )}
        </svg>

        <div className="absolute bottom-0 left-0 right-16 h-10 flex items-end gap-[1px] opacity-30">
          {displayCandles.map((candle, idx) => {
            const isGreen = candle.close >= candle.open;
            const maxVol = Math.max(...displayCandles.map(c => c.volume));
            const volHeight = (candle.volume / maxVol) * 100;
            return (
              <div
                key={idx}
                className={`flex-1 ${isGreen ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ height: `${volHeight}%` }}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <select
            value={selectedPair.symbol}
            onChange={(e) => {
              const pair = pairs.find(p => p.symbol === e.target.value);
              if (pair) setSelectedPair(pair);
            }}
            className="bg-card-dark border border-gray-700 rounded-lg px-3 py-2 text-white font-medium"
          >
            {pairs.map(pair => (
              <option key={pair.symbol} value={pair.symbol}>{pair.symbol}</option>
            ))}
          </select>
          <div>
            <span className="text-2xl font-light text-white">${formatPrice(selectedPair.price, 2)}</span>
            <span className={`ml-2 text-sm ${selectedPair.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {selectedPair.change >= 0 ? '+' : ''}{selectedPair.change.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Chain Selector */}
          {isConnected && currentChain && (
            <div className="flex items-center gap-2">
              {tradingConfig.useTestnet && (
                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full flex items-center gap-1">
                  <TestTube className="w-3 h-3" />
                  TESTNET
                </span>
              )}
              <select
                value={currentChain.id}
                onChange={(e) => {
                  const chainId = Number(e.target.value);
                  switchChain(chainId);
                  setTradingConfig(prev => ({ ...prev, selectedChainId: chainId }));
                }}
                className="bg-card-dark border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              >
                {getAllChains(tradingConfig.useTestnet).map(chain => (
                  <option key={chain.id} value={chain.id}>
                    {chain.shortName} {isTestnet(chain.id) ? '(Test)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Wallet Balance */}
          <div className="flex items-center gap-2 px-4 py-2 bg-card-dark rounded-lg border border-gray-700">
            <Wallet className="w-4 h-4 text-accent" />
            {isConnected ? (
              <div className="flex items-center gap-2">
                <span className="text-white font-light">${formatPrice(availableBalance, 2)}</span>
                <button
                  onClick={() => refreshBalances()}
                  className="text-gray-500 hover:text-white"
                  disabled={isLoadingBalances}
                >
                  <RefreshCw size={14} className={isLoadingBalances ? 'animate-spin' : ''} />
                </button>
              </div>
            ) : (
              <span className="text-gray-500">Not connected</span>
            )}
          </div>

          {!isConnected && (
            <button
              onClick={() => open()}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      {/* Not Connected Warning */}
      {!isConnected && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400" />
          <div>
            <p className="text-yellow-400 font-medium">Wallet Not Connected</p>
            <p className="text-gray-400 text-sm">Connect your wallet to start trading with real funds on DEX</p>
          </div>
        </div>
      )}

      {/* Network Mismatch Warning */}
      {isConnected && currentChain && tradingConfig.selectedChainId !== currentChain.id && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-orange-400" />
            <div>
              <p className="text-orange-400 font-medium">Network Mismatch</p>
              <p className="text-gray-400 text-sm">
                Bot is set to {getChainById(tradingConfig.selectedChainId)?.name || 'Unknown'}, but wallet is on {currentChain.name}
              </p>
            </div>
          </div>
          <button
            onClick={() => switchChain(tradingConfig.selectedChainId)}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Switch to {getChainById(tradingConfig.selectedChainId)?.shortName || 'Network'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Chart Section */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-white font-medium">Price Chart</span>
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-gray-500">Live</span>
                {currentChain && (
                  <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded">
                    {currentChain.dex.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 mr-4 bg-gray-800 rounded-lg p-1">
                  <button onClick={() => setZoomLevel(prev => Math.max(prev - 0.25, 0.5))} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white">
                    <ZoomOut size={16} />
                  </button>
                  <span className="text-xs text-gray-400 px-2">{Math.round(zoomLevel * 100)}%</span>
                  <button onClick={() => setZoomLevel(prev => Math.min(prev + 0.25, 3))} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white">
                    <ZoomIn size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                  {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                        timeframe === tf ? 'bg-accent text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4" style={{ height: chartHeight + 40 }}>
              {renderCandlestickChart()}
            </div>
          </div>

          {/* Strategy */}
          {analyzeMarket && (
            <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-accent" />
                <span className="text-white font-medium">AI Strategy</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-background rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {analyzeMarket.direction === 'LONG' ? (
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-400" />
                    )}
                    <span className={`text-lg font-semibold ${analyzeMarket.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                      {analyzeMarket.direction}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm">{analyzeMarket.reason}</p>
                </div>
                <div className="bg-background rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-2">Confidence</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${analyzeMarket.confidence > 75 ? 'bg-green-500' : analyzeMarket.confidence > 60 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                        style={{ width: `${analyzeMarket.confidence}%` }}
                      />
                    </div>
                    <span className="text-white font-semibold">{analyzeMarket.confidence}%</span>
                  </div>
                </div>
                <div className="bg-background rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-2">Indicators</p>
                  <div className="flex flex-wrap gap-1">
                    {analyzeMarket.indicators.map((ind, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">{ind}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Live Trades Feed - Mix of simulated + real trades for social proof */}
          <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
              <span className="text-white font-medium">Live Trades</span>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse ml-2" />
              <span className="text-gray-500 text-xs ml-auto">Community activity</span>
            </div>
            <div className="max-h-40 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-400 text-xs border-b border-gray-800 sticky top-0 bg-card-dark">
                  <tr>
                    <th className="text-left px-4 py-2">Wallet</th>
                    <th className="text-left px-4 py-2">Pair</th>
                    <th className="text-center px-4 py-2">Chain</th>
                    <th className="text-right px-4 py-2">Amount</th>
                    <th className="text-right px-4 py-2">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {topPerformers.slice(0, 8).map((trade, idx) => (
                      <motion.tr
                        key={trade.id}
                        initial={idx === 0 ? { opacity: 0, backgroundColor: 'rgba(255, 255, 255, 0.1)' } : { opacity: 1 }}
                        animate={{ opacity: 1, backgroundColor: 'transparent' }}
                        className="border-b border-gray-800/50"
                      >
                        <td className="px-4 py-2 font-mono text-gray-400 text-xs">{trade.wallet}</td>
                        <td className="px-4 py-2 text-white">{trade.pair}</td>
                        <td className="px-4 py-2 text-center">
                          <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded">{trade.chain}</span>
                        </td>
                        <td className="px-4 py-2 text-right text-white font-mono">${trade.amount.toLocaleString()}</td>
                        <td className={`px-4 py-2 text-right font-mono ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>

          {/* YOUR TRADES - Real transaction history */}
          <div className="bg-card-dark rounded-xl border border-white/20 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 bg-accent/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-accent" />
                  <span className="text-white font-medium">Your Trades</span>
                  <span className="px-2 py-0.5 bg-accent text-white text-xs rounded-full font-medium">
                    REAL
                  </span>
                  {tradeHistory.length > 0 && (
                    <span className="px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded-full">
                      {tradeHistory.length}
                    </span>
                  )}
                </div>
                {tradeHistory.length > 0 && (
                  <select
                    value={tradeFilter}
                    onChange={(e) => setTradeFilter(e.target.value as any)}
                    className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700"
                  >
                    <option value="all">All</option>
                    <option value="wins">Wins</option>
                    <option value="losses">Losses</option>
                  </select>
                )}
              </div>

              {/* Stats Summary */}
              {tradeHistory.length > 0 && (
                <div className="grid grid-cols-5 gap-2 mt-3 pt-3 border-t border-gray-700">
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Trades</p>
                    <p className="text-white font-medium">{tradeHistory.length}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Win Rate</p>
                    <p className="text-green-400 font-medium">
                      {tradeHistory.length > 0
                        ? ((tradeHistory.filter(t => (t.profit || 0) > 0).length / tradeHistory.length) * 100).toFixed(0)
                        : 0}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Total P/L</p>
                    <p className={`font-medium ${
                      tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) >= 0 ? '+' : ''}
                      ${tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Gas Spent</p>
                    <p className="text-orange-400 font-medium">
                      ${tradeHistory.reduce((sum, t) => sum + (t.gasCostUsd || 0), 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Net P/L</p>
                    <p className={`font-medium ${
                      (tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) - tradeHistory.reduce((sum, t) => sum + (t.gasCostUsd || 0), 0)) >= 0
                        ? 'text-green-400' : 'text-red-400'
                    }`}>
                      ${(tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) - tradeHistory.reduce((sum, t) => sum + (t.gasCostUsd || 0), 0)).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto">
              {tradeHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                  <History className="w-8 h-8 mb-2" />
                  <p>No trades yet</p>
                  <p className="text-xs">Your real trades will appear here</p>
                  <p className="text-xs text-accent mt-2">Verified on-chain transactions</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-gray-400 text-xs border-b border-gray-800 sticky top-0 bg-card-dark">
                    <tr>
                      <th className="text-left px-4 py-2">Time</th>
                      <th className="text-left px-4 py-2">Type</th>
                      <th className="text-center px-4 py-2">Chain</th>
                      <th className="text-right px-4 py-2">Amount</th>
                      <th className="text-right px-4 py-2">Gas</th>
                      <th className="text-right px-4 py-2">P/L</th>
                      <th className="text-right px-4 py-2">ROI</th>
                      <th className="text-center px-4 py-2">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {tradeHistory
                        .filter(t => {
                          if (tradeFilter === 'wins') return (t.profit || 0) > 0;
                          if (tradeFilter === 'losses') return (t.profit || 0) < 0;
                          return true;
                        })
                        .slice(0, 50)
                        .map((trade, idx) => {
                          const roi = parseFloat(trade.amountIn) > 0
                            ? ((trade.profit || 0) / parseFloat(trade.amountIn)) * 100
                            : 0;
                          return (
                            <motion.tr
                              key={trade.id}
                              initial={idx === 0 ? { opacity: 0, backgroundColor: 'rgba(255, 255, 255, 0.1)' } : { opacity: 1 }}
                              animate={{ opacity: 1, backgroundColor: 'transparent' }}
                              className="border-b border-gray-800/50 hover:bg-accent/5"
                            >
                              <td className="px-4 py-2 text-gray-400 text-xs">
                                {new Date(trade.timestamp).toLocaleString()}
                              </td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  trade.type === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {trade.type.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded">
                                  {trade.chainName}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right text-white font-mono text-xs">
                                ${parseFloat(trade.amountIn).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right text-orange-400 font-mono text-xs">
                                ${(trade.gasCostUsd || 0).toFixed(2)}
                              </td>
                              <td className={`px-4 py-2 text-right font-mono text-xs ${
                                (trade.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {(trade.profit || 0) >= 0 ? '+' : ''}${(trade.profit || 0).toFixed(2)}
                              </td>
                              <td className={`px-4 py-2 text-right font-mono text-xs ${
                                roi >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                              </td>
                              <td className="px-4 py-2 text-center">
                                <a
                                  href={trade.blockExplorerUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-accent hover:text-accent-hover"
                                  title="View on blockchain"
                                >
                                  <ExternalLink className="w-4 h-4 inline" />
                                </a>
                              </td>
                            </motion.tr>
                          );
                        })}
                    </AnimatePresence>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Trading Settings Panel */}
          {isConnected && (
            <TradingSettings
              config={tradingConfig}
              onConfigChange={setTradingConfig}
              tradeHistory={tradeHistory}
              currentChain={currentChainConfig}
              nativeTokenPrice={nativeTokenPrice}
              onSwitchChain={handleSwitchChain}
              onEmergencyStop={handleEmergencyStop}
              dailyPnL={dailyPnL}
              isTrading={botActive}
            />
          )}

          {!isConnected ? (
            <div className="bg-card-dark rounded-xl border border-gray-800 p-6 text-center">
              <Wallet className="w-12 h-12 text-accent mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Connect Wallet</h3>
              <p className="text-gray-400 text-sm mb-4">Connect your wallet to trade on DEX</p>
              <button
                onClick={() => open()}
                className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
              >
                Connect Wallet
              </button>
            </div>
          ) : !activeSubscription ? (
            <div className="bg-card-dark rounded-xl border border-gray-800 p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-accent" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Unlock Trading</h3>
                <p className="text-gray-400 text-sm">Choose a plan to start</p>
              </div>
              <button
                onClick={() => setShowPlans(true)}
                className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
              >
                View Plans
              </button>
            </div>
          ) : (
            <div className="bg-card-dark rounded-xl border border-gray-800 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Trade</h3>
                <span className="px-2 py-1 bg-white/10 text-accent text-xs rounded">{activeSubscription.tier}</span>
              </div>

              {!botActive ? (
                <>
                  {/* Bot Mode Indicator */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg">
                    <div className="flex items-center gap-2">
                      {tradingConfig.botMode === 'auto' ? (
                        <Timer className="w-4 h-4 text-accent" />
                      ) : tradingConfig.botMode === 'signals' ? (
                        <Bell className="w-4 h-4 text-yellow-400" />
                      ) : (
                        <Bot className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="text-white text-sm capitalize">{tradingConfig.botMode} Mode</span>
                    </div>
                    <span className="text-gray-400 text-xs capitalize">{tradingConfig.strategy}</span>
                  </div>

                  {/* Auto-Trade Controls - Only for Auto Mode */}
                  {tradingConfig.botMode === 'auto' && (
                    <div className="p-3 bg-background rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-white text-sm">Auto-Trade</span>
                        <button
                          onClick={() => setTradingConfig(prev => ({ ...prev, autoTradeEnabled: !prev.autoTradeEnabled }))}
                          className={`w-12 h-6 rounded-full transition-colors ${
                            tradingConfig.autoTradeEnabled ? 'bg-accent' : 'bg-gray-600'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                            tradingConfig.autoTradeEnabled ? 'translate-x-6' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>
                      {tradingConfig.autoTradeEnabled && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Next trade in:</span>
                          <span className="text-accent font-mono">
                            {Math.floor(nextAutoTradeIn / 3600)}h {Math.floor((nextAutoTradeIn % 3600) / 60)}m {nextAutoTradeIn % 60}s
                          </span>
                        </div>
                      )}
                      <p className="text-gray-500 text-xs">
                        Interval: {tradingConfig.tradingInterval} | Amount: ${tradeAmount}
                      </p>
                    </div>
                  )}

                  {/* Signals Mode Notice */}
                  {tradingConfig.botMode === 'signals' && analyzeMarket && (
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <div className="flex items-center gap-2 text-yellow-400 text-sm">
                        <Bell className="w-4 h-4" />
                        <span>Signal Only Mode</span>
                      </div>
                      <p className="text-gray-400 text-xs mt-1">
                        Bot shows signals but won't auto-execute trades
                      </p>
                    </div>
                  )}

                  {analyzeMarket && (
                    <div className={`p-3 rounded-lg border ${analyzeMarket.direction === 'LONG' ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                      <div className="flex items-center gap-2">
                        {analyzeMarket.direction === 'LONG' ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                        <span className={`font-semibold ${analyzeMarket.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                          {analyzeMarket.direction} Signal
                        </span>
                      </div>
                      <p className="text-gray-400 text-xs mt-1">Confidence: {analyzeMarket.confidence}%</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Amount (USD)</label>
                    <input
                      type="number"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(Math.min(Math.max(Number(e.target.value), 10), getMaxAmount()))}
                      min={10}
                      max={getMaxAmount()}
                      className="w-full bg-background border border-gray-700 rounded-lg px-3 py-2 text-white"
                    />
                    <input
                      type="range"
                      min={10}
                      max={getMaxAmount() || 1000}
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(Number(e.target.value))}
                      className="w-full mt-2 accent-accent"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>$10</span>
                      <span>${getMaxAmount().toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Gas Estimator */}
                  {tradeAmount > 0 && currentChain && (
                    <GasEstimator
                      chainId={currentChain.id}
                      tradeAmount={tradeAmount}
                      nativeTokenPrice={nativeTokenPrice}
                      slippagePercent={tradingConfig.slippagePercent}
                      expectedOutput={expectedOutput}
                      priceImpact={priceImpact}
                      onWarning={setHasGasWarning}
                    />
                  )}

                  <button
                    onClick={() => setShowRiskWarning(true)}
                    disabled={!analyzeMarket || isExecuting || tradeAmount > availableBalance}
                    className="w-full py-4 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExecuting ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Play size={20} />
                    )}
                    {isExecuting ? 'Executing...' : `Open ${analyzeMarket?.direction || '...'}`}
                  </button>

                  {/* Quick cost estimate */}
                  {estimatedCosts.gasCostPerTrade > 0 && (
                    <div className="text-center text-xs text-gray-500">
                      Est. gas: ${estimatedCosts.gasCostPerTrade.toFixed(2)} ({estimatedCosts.gasPercentage.toFixed(1)}% of trade)
                    </div>
                  )}

                  {tradeAmount > availableBalance && (
                    <p className="text-red-400 text-sm text-center">Insufficient balance</p>
                  )}

                  {/* Daily PnL Display */}
                  {dailyPnL !== 0 && (
                    <div className={`p-3 rounded-lg border ${dailyPnL >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Today's P/L</span>
                        <span className={dailyPnL >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {dailyPnL >= 0 ? '+' : ''}${dailyPnL.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="bg-background rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2 text-green-400">
                      <Bot className="w-5 h-5" />
                      <span className="font-medium">Position Open</span>
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse ml-auto" />
                    </div>

                    {strategy && (
                      <div className={`flex items-center gap-2 p-2 rounded ${strategy.direction === 'LONG' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                        {strategy.direction === 'LONG' ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                        <span className={`font-semibold ${strategy.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                          {strategy.direction}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500 text-xs">Size</p>
                        <p className="text-white font-medium">${tradeAmount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Entry</p>
                        <p className="text-white font-medium">${formatPrice(entryPrice, 2)}</p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-700">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-gray-500 text-xs">Unrealized P/L</p>
                        <div className={`flex items-center gap-1 text-xs ${currentPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {currentPnL >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                          {((currentPnL / tradeAmount) * 100).toFixed(2)}%
                        </div>
                      </div>
                      <p className={`text-2xl font-light ${currentPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {currentPnL >= 0 ? '+' : ''}${formatPrice(currentPnL, 2)}
                      </p>
                    </div>

                    {/* TP/SL Indicators */}
                    {(tradingConfig.takeProfitEnabled || tradingConfig.stopLossEnabled) && (
                      <div className="pt-3 border-t border-gray-700 space-y-2">
                        {tradingConfig.takeProfitEnabled && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-green-400">Take Profit</span>
                            <span className="text-gray-400">+{tradingConfig.takeProfitPercent}% (${(tradeAmount * tradingConfig.takeProfitPercent / 100).toFixed(2)})</span>
                          </div>
                        )}
                        {tradingConfig.stopLossEnabled && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-red-400">Stop Loss</span>
                            <span className="text-gray-400">-{tradingConfig.stopLossPercent}% (-${(tradeAmount * tradingConfig.stopLossPercent / 100).toFixed(2)})</span>
                          </div>
                        )}
                        {tradingConfig.autoReopenEnabled && (
                          <div className="flex items-center gap-1 text-xs text-accent">
                            <Zap size={12} />
                            <span>Auto-reopen enabled</span>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTrade && (
                      <a
                        href={`${currentChain?.blockExplorer}/tx/${activeTrade.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-accent text-xs hover:underline"
                      >
                        <ExternalLink size={12} />
                        View on Explorer
                      </a>
                    )}

                    <div className="pt-3 border-t border-gray-700">
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <Clock size={14} />
                        <span>Min. hold time</span>
                      </div>
                      <p className="text-xl font-medium text-white mt-1">{formatTime(timeRemaining)}</p>
                      <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
                        <div
                          className="bg-accent h-full rounded-full transition-all"
                          style={{ width: `${Math.max(0, 100 - (timeRemaining / MIN_TRADE_TIME) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleStopBot}
                    disabled={timeRemaining > 0 || isExecuting}
                    className={`w-full py-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                      timeRemaining > 0 || isExecuting
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                    }`}
                  >
                    {isExecuting ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Square size={20} />
                    )}
                    {isExecuting ? 'Closing...' : timeRemaining > 0 ? `Wait ${formatTime(timeRemaining)}` : 'Close Position'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Risk Warning Modal */}
      {showRiskWarning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowRiskWarning(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card-dark rounded-2xl border border-gray-800 p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Trading Cost Warning</h3>
                <p className="text-gray-400 text-sm">Please review before starting</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="p-3 bg-background rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Gas per trade:</span>
                  <span className="text-white font-mono">${estimatedCosts.gasCostPerTrade.toFixed(2)}</span>
                </div>
              </div>

              <div className="p-3 bg-background rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Trades per day ({tradingConfig.tradingInterval}):</span>
                  <span className="text-white font-mono">{estimatedCosts.tradesPerDay.toFixed(0)}</span>
                </div>
              </div>

              <div className="p-3 bg-background rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Est. daily gas cost:</span>
                  <span className={`font-mono ${estimatedCosts.dailyGasCost > 100 ? 'text-red-400' : 'text-orange-400'}`}>
                    ${estimatedCosts.dailyGasCost.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-background rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Gas % of trade:</span>
                  <span className={`font-mono ${estimatedCosts.gasPercentage > 10 ? 'text-red-400' : estimatedCosts.gasPercentage > 5 ? 'text-orange-400' : 'text-green-400'}`}>
                    {estimatedCosts.gasPercentage.toFixed(1)}%
                  </span>
                </div>
              </div>

              {estimatedCosts.gasPercentage > 5 && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-red-400 text-sm">
                    <strong>Warning:</strong> Gas is {estimatedCosts.gasPercentage.toFixed(0)}% of your trade!
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    Consider: Using BSC (low gas), increasing trade amount, or using longer intervals.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowRiskWarning(false)}
                className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRiskWarning(false);
                  handleStartBot();
                }}
                className="flex-1 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover"
              >
                I Understand, Start
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Plans Modal */}
      {showPlans && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPlans(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card-dark rounded-2xl border border-gray-800 p-8 max-w-4xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-white mb-2">Choose Plan</h2>
              <p className="text-gray-400">Pay with crypto to unlock trading</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {planTiers.map((plan) => (
                <motion.div
                  key={plan.id}
                  whileHover={{ scale: 1.02 }}
                  className={`relative bg-background rounded-xl border ${selectedPlan === plan.id ? 'border-accent' : 'border-gray-700'} p-6 cursor-pointer`}
                  onClick={() => setSelectedPlan(plan.id)}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent text-white text-xs font-medium rounded-full">
                      Popular
                    </div>
                  )}

                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center text-white mb-4`}>
                    {plan.icon}
                  </div>

                  <h3 className="text-xl font-semibold text-white mb-1">{plan.name}</h3>
                  <div className="mb-4">
                    <span className="text-3xl font-light text-white">${plan.price}</span>
                    <span className="text-gray-400">/mo</span>
                    <p className="text-gray-500 text-sm">~{plan.priceToken}</p>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-gray-400">
                        <Check className="w-4 h-4 text-green-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={(e) => { e.stopPropagation(); handlePurchase(plan.id); }}
                    className={`w-full py-3 rounded-lg font-medium ${selectedPlan === plan.id ? 'bg-accent text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                  >
                    Select
                  </button>
                </motion.div>
              ))}
            </div>

            <button onClick={() => setShowPlans(false)} className="mt-6 w-full py-3 text-gray-400 hover:text-white">
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default TradingBotPage;
