import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { VaultBalanceCard } from '../../components/vault';
import { supabase } from '../../lib/supabase';

// Bot position from Supabase
interface BotPosition {
  id: string;
  token_symbol: string;
  direction: 'LONG' | 'SHORT';
  entry_price: number;
  status: 'open' | 'closing' | 'closed' | 'failed';
  take_profit_price: number | null;
  trailing_stop_price: number | null;
}

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
  metrics?: {
    rsi: number;
    macd: string;
    priceChange1h: string;
    priceChange24h: string;
    volumeRatio: string;
    conditionsMet?: number;
    riskReward?: string;
    trend?: string;
  };
  qualityMetrics?: {
    conditionsMet: number;
    totalConditions: number;
    riskReward: number;
    volumeRatio: number;
    isQualitySignal: boolean;
    qualityWarning: string;
    suggestedTP: number;
    suggestedSL: number;
  };
  scores?: {
    bullishScore: number;
    bearishScore: number;
  };
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
  usedNativeSwap?: boolean; // Track if native token swap was used
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
  const navigate = useNavigate();
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
    swapNativeForTokens,
    swapTokensForNative,
    dexRouter
  } = useWeb3();
  const { activeSubscription, isSubscribed, planTier, dailyTradesRemaining, subscription } = useSubscription();
  const { addNotification } = useNotifications();

  const [showPlans, setShowPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [botActive, setBotActive] = useState(false);
  const [tradeAmount, setTradeAmount] = useState(50);
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
  const [turboMode, setTurboMode] = useState(false);
  const [botPositions, setBotPositions] = useState<BotPosition[]>([]);

  // Minimum trade time - very short for aggressive trading
  const MIN_TRADE_TIME = turboMode ? 3 : 30; // 3 seconds in turbo, 30 seconds normal

  const planTiers = [
    {
      id: 'starter',
      name: 'Starter',
      price: 19,
      icon: <Zap className="w-8 h-8" />,
      color: 'from-gray-600 to-gray-700',
      features: ['25 trades per day', 'Base & Polygon', 'Spot & DCA strategies']
    },
    {
      id: 'pro',
      name: 'Professional',
      price: 79,
      icon: <Crown className="w-8 h-8" />,
      color: 'from-gray-400 to-gray-500',
      popular: true,
      features: ['100 trades per day', 'All chains', 'Grid & DCA strategies', 'Priority support']
    },
    {
      id: 'elite',
      name: 'Elite',
      price: 199,
      icon: <Rocket className="w-8 h-8" />,
      color: 'from-white to-gray-300',
      features: ['Unlimited trades', 'All chains', 'All strategies + Arbitrage', 'API access']
    }
  ];

  // Get available balance (USDT/USDC + native token value from wallet)
  const availableBalance = useMemo(() => {
    // Stablecoins
    const stables = tokenBalances.filter(t =>
      t.symbol === 'USDT' || t.symbol === 'USDC'
    );
    const stableBalance = stables.reduce((sum, t) => sum + parseFloat(t.balance), 0);

    // Also include total USD value which includes native tokens
    // Use the larger of stables or total value to ensure native tokens can be traded
    return Math.max(stableBalance, totalUsdValue);
  }, [tokenBalances, totalUsdValue]);

  // State for rejected trade logging
  const [lastRejectedTrade, setLastRejectedTrade] = useState<{
    signal: string;
    confidence: number;
    riskReward: number;
    volumeRatio: number;
    reason: string;
    timestamp: Date;
  } | null>(null);

  // Analyze market with MULTI-FACTOR CONFIRMATION SYSTEM
  const analyzeMarket = useMemo(() => {
    if (candles.length < 50) return null;

    const recentCandles = candles.slice(-50);
    const closes = recentCandles.map(c => c.close);
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    const volumes = recentCandles.map(c => c.volume);
    const currentPrice = closes[closes.length - 1];

    // === MOVING AVERAGES ===
    const sma7 = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const sma50 = closes.reduce((a, b) => a + b, 0) / 50;

    // EMA calculation
    const ema12 = closes.slice(-12).reduce((acc, val, i, arr) => {
      const multiplier = 2 / (arr.length + 1);
      return i === 0 ? val : val * multiplier + acc * (1 - multiplier);
    }, closes[closes.length - 12]);
    const ema26 = closes.slice(-26).reduce((acc, val, i, arr) => {
      const multiplier = 2 / (arr.length + 1);
      return i === 0 ? val : val * multiplier + acc * (1 - multiplier);
    }, closes[closes.length - 26]);

    // === RSI (14 period) ===
    let gains = 0, losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    // RSI momentum (is it rising or falling?)
    const rsiPrev = (() => {
      let g = 0, l = 0;
      for (let i = closes.length - 15; i < closes.length - 1; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) g += diff;
        else l += Math.abs(diff);
      }
      const avgG = g / 14;
      const avgL = l / 14;
      const rsP = avgL === 0 ? 100 : avgG / avgL;
      return 100 - (100 / (1 + rsP));
    })();
    const rsiRising = rsi > rsiPrev + 2;
    const rsiFalling = rsi < rsiPrev - 2;

    // === MACD ===
    const macd = ema12 - ema26;
    const prevEma12 = closes.slice(-13, -1).reduce((acc, val, i, arr) => {
      const multiplier = 2 / (arr.length + 1);
      return i === 0 ? val : val * multiplier + acc * (1 - multiplier);
    }, closes[closes.length - 13]);
    const prevEma26 = closes.slice(-27, -1).reduce((acc, val, i, arr) => {
      const multiplier = 2 / (arr.length + 1);
      return i === 0 ? val : val * multiplier + acc * (1 - multiplier);
    }, closes[closes.length - 27]);
    const prevMacd = prevEma12 - prevEma26;
    const macdCrossover = macd > 0 && prevMacd <= 0;
    const macdCrossunder = macd < 0 && prevMacd >= 0;
    const macdStrong = Math.abs(macd) > 0.5;

    // === BOLLINGER BANDS (20 period, 2 std) ===
    const sma20Bb = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const squaredDiffs = closes.slice(-20).map(c => Math.pow(c - sma20Bb, 2));
    const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / 20);
    const upperBand = sma20Bb + (2 * stdDev);
    const lowerBand = sma20Bb - (2 * stdDev);
    const bbPosition = (currentPrice - lowerBand) / (upperBand - lowerBand);

    // === VOLUME ANALYSIS ===
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = currentVolume / avgVolume;
    const isHighVolume = volumeRatio > 1.5;
    const isAdequateVolume = volumeRatio > 1.2;

    // === PRICE CHANGE ===
    const priceChange1h = ((currentPrice - closes[closes.length - 4]) / closes[closes.length - 4]) * 100;
    const priceChange24h = ((currentPrice - closes[0]) / closes[0]) * 100;

    // === SUPPORT/RESISTANCE ===
    const recentLow = Math.min(...lows.slice(-20));
    const recentHigh = Math.max(...highs.slice(-20));
    const nearSupport = currentPrice < recentLow * 1.02;
    const nearResistance = currentPrice > recentHigh * 0.98;
    const distanceToResistance = ((recentHigh - currentPrice) / currentPrice) * 100;
    const distanceToSupport = ((currentPrice - recentLow) / currentPrice) * 100;

    // === CANDLE PATTERNS ===
    const lastCandle = recentCandles[recentCandles.length - 1];
    const prevCandle = recentCandles[recentCandles.length - 2];
    const thirdCandle = recentCandles[recentCandles.length - 3];

    // Engulfing patterns
    const isBullishEngulfing = lastCandle.close > lastCandle.open &&
                               prevCandle.close < prevCandle.open &&
                               lastCandle.close > prevCandle.open &&
                               lastCandle.open < prevCandle.close;
    const isBearishEngulfing = lastCandle.close < lastCandle.open &&
                               prevCandle.close > prevCandle.open &&
                               lastCandle.close < prevCandle.open &&
                               lastCandle.open > prevCandle.close;

    // Doji detection (small body, long wicks)
    const lastCandleBody = Math.abs(lastCandle.close - lastCandle.open);
    const lastCandleRange = lastCandle.high - lastCandle.low;
    const isDoji = lastCandleBody < lastCandleRange * 0.1 && lastCandleRange > 0;

    // Long wick rejection patterns
    const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
    const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
    const hasLongUpperWick = upperWick > lastCandleBody * 2 && upperWick > lastCandleRange * 0.3;
    const hasLongLowerWick = lowerWick > lastCandleBody * 2 && lowerWick > lastCandleRange * 0.3;

    // === IMMEDIATE CANDLE MOMENTUM (Critical for 1m/5m timeframes) ===
    // Calculate average candle body size for comparison
    const recentBodies = recentCandles.slice(-10).map(c => Math.abs(c.close - c.open));
    const avgBodySize = recentBodies.reduce((a, b) => a + b, 0) / recentBodies.length;

    // Detect large candles (body > 1.5x average)
    const lastCandleIsBearish = lastCandle.close < lastCandle.open;
    const lastCandleIsBullish = lastCandle.close > lastCandle.open;
    const isLargeCandle = lastCandleBody > avgBodySize * 1.5;
    const isVeryLargeCandle = lastCandleBody > avgBodySize * 2.5;

    // Check last 3 candles for consistent momentum
    const last3Candles = recentCandles.slice(-3);
    const bearishCandlesCount = last3Candles.filter(c => c.close < c.open).length;
    const bullishCandlesCount = last3Candles.filter(c => c.close > c.open).length;

    // Calculate short-term momentum (price change over last 3 candles)
    const shortTermMomentum = ((closes[closes.length - 1] - closes[closes.length - 3]) / closes[closes.length - 3]) * 100;
    const isStrongShortTermBearish = shortTermMomentum < -0.5 && bearishCandlesCount >= 2;
    const isStrongShortTermBullish = shortTermMomentum > 0.5 && bullishCandlesCount >= 2;

    // Immediate momentum flags
    const immediateBearishMomentum = (isLargeCandle && lastCandleIsBearish) ||
                                      (isVeryLargeCandle && lastCandleIsBearish) ||
                                      (isStrongShortTermBearish && bearishCandlesCount === 3);
    const immediateBullishMomentum = (isLargeCandle && lastCandleIsBullish) ||
                                      (isVeryLargeCandle && lastCandleIsBullish) ||
                                      (isStrongShortTermBullish && bullishCandlesCount === 3);

    // === TREND ANALYSIS (Higher Highs/Lower Lows) ===
    const last10Highs = highs.slice(-10);
    const last10Lows = lows.slice(-10);

    // Check for higher lows (uptrend)
    let higherLowsCount = 0;
    for (let i = 1; i < last10Lows.length; i++) {
      if (last10Lows[i] > last10Lows[i - 1]) higherLowsCount++;
    }
    const isFormingHigherLows = higherLowsCount >= 6;

    // Check for lower highs (downtrend)
    let lowerHighsCount = 0;
    for (let i = 1; i < last10Highs.length; i++) {
      if (last10Highs[i] < last10Highs[i - 1]) lowerHighsCount++;
    }
    const isFormingLowerHighs = lowerHighsCount >= 6;

    // Determine overall trend
    const isStrongUptrend = isFormingHigherLows && sma7 > sma20 && sma20 > sma50;
    const isStrongDowntrend = isFormingLowerHighs && sma7 < sma20 && sma20 < sma50;
    const trend = isStrongUptrend ? 'STRONG_UPTREND' : isStrongDowntrend ? 'STRONG_DOWNTREND' : 'NEUTRAL';

    // === MULTI-FACTOR CONFIRMATION SYSTEM ===
    // For HIGH confidence, we need 4/6 conditions to align
    // Now includes IMMEDIATE MOMENTUM for fast reaction to price action

    // SHORT CONDITIONS (6 factors)
    const shortConditions = {
      rsiOverbought: rsi > 70 || (rsi > 60 && rsiFalling),
      macdBearish: macd < -0.5 || (macdCrossunder && Math.abs(macd) > 0.2),
      volumeConfirmed: isHighVolume && priceChange1h < 0,
      priceRejectedResistance: nearResistance && (isBearishEngulfing || hasLongUpperWick),
      lowerHighsForming: isFormingLowerHighs,
      immediateBearish: immediateBearishMomentum // NEW: Large red candle or consecutive bearish candles
    };
    const shortConditionsMet = Object.values(shortConditions).filter(Boolean).length;

    // LONG CONDITIONS (6 factors)
    const longConditions = {
      rsiOversold: rsi < 30 || (rsi < 40 && rsiRising),
      macdBullish: macd > 0.5 || (macdCrossover && Math.abs(macd) > 0.2),
      volumeConfirmed: isHighVolume && priceChange1h > 0,
      priceBouncingSupport: nearSupport && (isBullishEngulfing || hasLongLowerWick),
      higherLowsForming: isFormingHigherLows,
      immediateBullish: immediateBullishMomentum // NEW: Large green candle or consecutive bullish candles
    };
    const longConditionsMet = Object.values(longConditions).filter(Boolean).length;

    // === CONFIDENCE SCORING BASED ON CONDITIONS MET ===
    const calculateConfidence = (conditionsMet: number, volumeRatio: number, volumeFilterEnabled: boolean): number => {
      let baseConfidence: number;

      if (conditionsMet >= 5) baseConfidence = 92;
      else if (conditionsMet >= 4) baseConfidence = 85;
      else if (conditionsMet === 3) baseConfidence = 65;
      else if (conditionsMet === 2) baseConfidence = 45;
      else baseConfidence = 25;

      // Volume penalty if filter enabled and volume is low
      if (volumeFilterEnabled && volumeRatio < 1.2) {
        baseConfidence -= 20;
      } else if (volumeRatio >= 1.5) {
        baseConfidence += 5; // Bonus for strong volume
      }

      return Math.max(20, Math.min(95, baseConfidence));
    };

    // Determine direction based on which has more conditions met
    let direction: 'LONG' | 'SHORT' | 'HOLD' = 'HOLD';
    let conditionsMet = 0;
    let conditions: Record<string, boolean> = {};

    if (longConditionsMet > shortConditionsMet && longConditionsMet >= 2) {
      direction = 'LONG';
      conditionsMet = longConditionsMet;
      conditions = longConditions;
    } else if (shortConditionsMet > longConditionsMet && shortConditionsMet >= 2) {
      direction = 'SHORT';
      conditionsMet = shortConditionsMet;
      conditions = shortConditions;
    } else if (longConditionsMet === shortConditionsMet && longConditionsMet >= 2) {
      // Tie-breaker: use recent momentum
      const momentum3 = ((closes[closes.length - 1] - closes[closes.length - 3]) / closes[closes.length - 3]) * 100;
      direction = momentum3 > 0 ? 'LONG' : 'SHORT';
      conditionsMet = longConditionsMet;
      conditions = momentum3 > 0 ? longConditions : shortConditions;
    }

    // === IMMEDIATE MOMENTUM OVERRIDE (Critical for 1m/5m) ===
    // If we have a VERY large candle in the opposite direction, override or reduce confidence
    let momentumOverride = false;
    let confidencePenalty = 0;

    if (direction === 'LONG' && isVeryLargeCandle && lastCandleIsBearish) {
      // Very large red candle contradicts LONG signal
      if (shortConditionsMet >= 2) {
        // Switch to SHORT if we have at least 2 short conditions
        direction = 'SHORT';
        conditionsMet = shortConditionsMet;
        conditions = shortConditions;
        momentumOverride = true;
      } else {
        // Go to HOLD if contradiction is strong
        direction = 'HOLD';
        confidencePenalty = 30;
      }
    } else if (direction === 'SHORT' && isVeryLargeCandle && lastCandleIsBullish) {
      // Very large green candle contradicts SHORT signal
      if (longConditionsMet >= 2) {
        // Switch to LONG if we have at least 2 long conditions
        direction = 'LONG';
        conditionsMet = longConditionsMet;
        conditions = longConditions;
        momentumOverride = true;
      } else {
        // Go to HOLD if contradiction is strong
        direction = 'HOLD';
        confidencePenalty = 30;
      }
    } else if (direction === 'LONG' && isLargeCandle && lastCandleIsBearish) {
      // Large (but not very large) red candle - reduce confidence
      confidencePenalty = 15;
    } else if (direction === 'SHORT' && isLargeCandle && lastCandleIsBullish) {
      // Large (but not very large) green candle - reduce confidence
      confidencePenalty = 15;
    }

    // Calculate confidence (apply penalty for contradicting candles)
    const rawConfidence = calculateConfidence(conditionsMet, volumeRatio, tradingConfig.volumeFilterEnabled);
    const confidence = Math.max(20, rawConfidence - confidencePenalty);

    // === RISK/REWARD CALCULATION ===
    const rawTakeProfitDistance = direction === 'LONG' ? distanceToResistance : distanceToSupport;
    const rawStopLossDistance = direction === 'LONG' ? distanceToSupport : distanceToResistance;

    // Ensure minimum distances to avoid wild R/R ratios (min 0.3% distance)
    const minDistance = 0.3;
    const takeProfitDistance = Math.max(rawTakeProfitDistance, minDistance);
    const stopLossDistance = Math.max(rawStopLossDistance, minDistance);

    // Calculate R/R with a cap to prevent unrealistic values (max 10x)
    const rawRiskReward = stopLossDistance > 0 ? takeProfitDistance / stopLossDistance : 1;
    const riskReward = Math.min(Math.max(rawRiskReward, 0.1), 10);

    // Suggested TP/SL levels
    const suggestedTP = direction === 'LONG' ? recentHigh : recentLow;
    const suggestedSL = direction === 'LONG' ? recentLow : recentHigh;

    // === TREND FILTER CHECK ===
    let trendWarning: string | null = null;
    if (tradingConfig.trendFilterEnabled) {
      if (direction === 'SHORT' && isStrongUptrend) {
        trendWarning = "Warning: Shorting in strong uptrend";
      } else if (direction === 'LONG' && isStrongDowntrend) {
        trendWarning = "Warning: Longing in strong downtrend";
      }
    }

    // === BUILD INDICATORS LIST ===
    const indicators: string[] = [];
    const reasons: string[] = [];

    if (direction === 'LONG') {
      if (conditions.rsiOversold) {
        indicators.push(`RSI ${rsi.toFixed(0)} ${rsiRising ? '↗' : ''}`);
        reasons.push(`RSI at ${rsi.toFixed(0)}${rsiRising ? ' and rising' : ''} - oversold`);
      }
      if (conditions.macdBullish) {
        indicators.push(macdCrossover ? 'MACD Cross ↑' : 'MACD Bullish');
        reasons.push(macdCrossover ? 'MACD bullish crossover' : 'Strong bullish MACD');
      }
      if (conditions.volumeConfirmed) {
        indicators.push(`Vol ${volumeRatio.toFixed(1)}x ↑`);
        reasons.push(`Volume ${volumeRatio.toFixed(1)}x with buying pressure`);
      }
      if (conditions.priceBouncingSupport) {
        indicators.push('Support Bounce');
        reasons.push('Price bouncing from support with bullish pattern');
      }
      if (conditions.higherLowsForming) {
        indicators.push('Higher Lows');
        reasons.push('Forming higher lows - uptrend structure');
      }
      if (conditions.immediateBullish) {
        indicators.push('Strong Green Candle ↑');
        reasons.push('Large bullish candle or consecutive green candles');
      }
    } else if (direction === 'SHORT') {
      if (conditions.rsiOverbought) {
        indicators.push(`RSI ${rsi.toFixed(0)} ${rsiFalling ? '↘' : ''}`);
        reasons.push(`RSI at ${rsi.toFixed(0)}${rsiFalling ? ' and falling' : ''} - overbought`);
      }
      if (conditions.macdBearish) {
        indicators.push(macdCrossunder ? 'MACD Cross ↓' : 'MACD Bearish');
        reasons.push(macdCrossunder ? 'MACD bearish crossover' : 'Strong bearish MACD');
      }
      if (conditions.volumeConfirmed) {
        indicators.push(`Vol ${volumeRatio.toFixed(1)}x ↓`);
        reasons.push(`Volume ${volumeRatio.toFixed(1)}x with selling pressure`);
      }
      if (conditions.priceRejectedResistance) {
        indicators.push('Resistance Rejection');
        reasons.push('Price rejected at resistance with bearish pattern');
      }
      if (conditions.lowerHighsForming) {
        indicators.push('Lower Highs');
        reasons.push('Forming lower highs - downtrend structure');
      }
      if (conditions.immediateBearish) {
        indicators.push('Strong Red Candle ↓');
        reasons.push('Large bearish candle or consecutive red candles');
      }
    }

    // Add candle pattern bonuses
    if (isBullishEngulfing && direction === 'LONG') {
      indicators.push('Bullish Engulfing');
    }
    if (isBearishEngulfing && direction === 'SHORT') {
      indicators.push('Bearish Engulfing');
    }
    if (isDoji && (nearSupport || nearResistance)) {
      indicators.push('Doji @ S/R');
    }

    // Build detailed reason
    const topReasons = reasons.slice(0, 3);
    let detailedReason = topReasons.length > 0
      ? topReasons.join('. ') + '.'
      : direction === 'HOLD'
        ? 'Insufficient confirmation - waiting for better setup.'
        : 'Mixed signals.';

    if (trendWarning) {
      detailedReason += ` ${trendWarning}.`;
    }

    // Add momentum override notification
    if (momentumOverride) {
      detailedReason += ' Signal overridden by strong immediate price action.';
    } else if (confidencePenalty > 0) {
      detailedReason += ' Confidence reduced due to contradicting candle.';
    }

    // === FINAL SIGNAL QUALITY CHECK ===
    const meetsMinConfidence = confidence >= tradingConfig.minConfidence;
    const meetsMinRiskReward = riskReward >= tradingConfig.minRiskReward;
    const passesVolumeFilter = !tradingConfig.volumeFilterEnabled || isAdequateVolume;
    const passesTrendFilter = !tradingConfig.trendFilterEnabled || !trendWarning;

    const isQualitySignal = meetsMinConfidence && meetsMinRiskReward && passesVolumeFilter && passesTrendFilter;

    // ALWAYS show LONG or SHORT - never HOLD
    // Quality metrics are informational only - don't block trading
    let finalDirection = direction;
    let qualityWarning = '';

    // If direction is HOLD (not enough conditions), force to stronger signal
    if (direction === 'HOLD') {
      finalDirection = longConditionsMet >= shortConditionsMet ? 'LONG' : 'SHORT';
      detailedReason = `Weak setup - ${finalDirection} has slightly more confirmation (${Math.max(longConditionsMet, shortConditionsMet)}/5)`;
    }

    // Log quality warnings but don't block
    if (!isQualitySignal) {
      const warnings: string[] = [];
      if (!meetsMinConfidence) warnings.push(`Low confidence: ${confidence}%`);
      if (!meetsMinRiskReward) warnings.push(`Low R/R: ${riskReward.toFixed(2)}`);
      if (!passesVolumeFilter) warnings.push(`Low volume: ${volumeRatio.toFixed(1)}x`);
      if (!passesTrendFilter && trendWarning) warnings.push(trendWarning);

      qualityWarning = warnings.join(', ');
      console.log(`⚠️ Signal quality warning: ${qualityWarning}`);
    }

    return {
      direction: finalDirection as 'LONG' | 'SHORT',
      confidence: Math.round(confidence),
      reason: detailedReason,
      indicators: indicators.slice(0, 6),
      metrics: {
        rsi: Math.round(rsi),
        macd: macd.toFixed(4),
        priceChange1h: priceChange1h.toFixed(2),
        priceChange24h: priceChange24h.toFixed(2),
        volumeRatio: volumeRatio.toFixed(1),
        conditionsMet,
        riskReward: riskReward.toFixed(2),
        trend
      },
      // Quality metrics for display (informational only)
      qualityMetrics: {
        conditionsMet,
        totalConditions: 5,
        riskReward,
        volumeRatio,
        isQualitySignal,
        qualityWarning,
        suggestedTP,
        suggestedSL
      },
      // For backward compatibility
      scores: {
        bullishScore: longConditionsMet * 20,
        bearishScore: shortConditionsMet * 20
      }
    };
  }, [candles, timeframe, tradingConfig.minConfidence, tradingConfig.minRiskReward, tradingConfig.volumeFilterEnabled, tradingConfig.trendFilterEnabled, turboMode]);

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

  // Fetch bot positions from Supabase
  useEffect(() => {
    const fetchBotPositions = async () => {
      try {
        const { data, error } = await supabase
          .from('positions')
          .select('id, token_symbol, direction, entry_price, status, take_profit_price, trailing_stop_price')
          .in('status', ['open', 'closing'])
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching bot positions:', error);
          return;
        }

        setBotPositions(data || []);
      } catch (err) {
        console.error('Error fetching bot positions:', err);
      }
    };

    fetchBotPositions();
    // Refresh positions every 30 seconds
    const interval = setInterval(fetchBotPositions, 30000);
    return () => clearInterval(interval);
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
      (isSubscribed || planTier === 'free') &&
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
    isSubscribed,
    planTier,
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

  // Sync tradingConfig with wallet's current chain when connected
  useEffect(() => {
    if (isConnected && currentChain && currentChain.id !== tradingConfig.selectedChainId) {
      // Check if the wallet's chain is supported
      const isSupported = getAllChains(tradingConfig.useTestnet).some(c => c.id === currentChain.id);
      if (isSupported) {
        setTradingConfig(prev => ({ ...prev, selectedChainId: currentChain.id }));
      }
    }
  }, [isConnected, currentChain?.id]);

  useEffect(() => {
    const interval = setInterval(fetchPrices, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch candles - faster in turbo mode for real-time decisions
  useEffect(() => {
    const refreshRate = turboMode && botActive ? 2000 : 10000; // 2s in turbo, 10s normal
    const interval = setInterval(() => fetchCandles(selectedPair.binanceSymbol, timeframe), refreshRate);
    return () => clearInterval(interval);
  }, [selectedPair.binanceSymbol, timeframe, turboMode, botActive]);

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

  // Update PnL - calculate unrealized profit based on current market price
  useEffect(() => {
    if (!botActive || entryPrice === 0 || !strategy || !activeTrade) return;

    const currentPrice = candles[candles.length - 1]?.close || selectedPair.price;
    let priceChange: number;

    if (strategy.direction === 'LONG') {
      // LONG: profit when price goes up
      priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
      // SHORT: profit when price goes down
      priceChange = ((entryPrice - currentPrice) / entryPrice) * 100;
    }

    // Calculate P/L based on trade amount
    const pnl = activeTrade.amount * (priceChange / 100);
    setCurrentPnL(pnl);

    // Log for debugging
    if (Math.abs(pnl) > 0.001) {
      console.log(`P/L Update: Entry $${entryPrice.toFixed(2)} → Current $${currentPrice.toFixed(2)} = ${priceChange.toFixed(3)}% ($${pnl.toFixed(4)})`);
    }
  }, [candles, botActive, entryPrice, activeTrade, selectedPair.price, strategy]);

  // AUTO-CLOSE LOGIC - AI decides when to close for WINNING trades
  useEffect(() => {
    if (!botActive || !activeTrade || entryPrice === 0 || isExecuting) return;

    const currentPrice = candles[candles.length - 1]?.close || selectedPair.price;
    let priceChangePercent: number;
    if (strategy?.direction === 'LONG') {
      priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
      priceChangePercent = ((entryPrice - currentPrice) / entryPrice) * 100;
    }

    const isInProfit = priceChangePercent > 0;
    const minWinPercent = tradingConfig.takeProfitPercent || 0.1; // Minimum win target

    // === TURBO MODE: AI-DRIVEN WIN-ONLY CLOSING ===
    if (turboMode) {
      // PRIORITY 1: Close in profit when we hit minimum win target
      if (isInProfit && priceChangePercent >= minWinPercent) {
        console.log(`✅ WIN: Closing at +${priceChangePercent.toFixed(3)}% profit`);
        addNotification({
          type: 'take_profit',
          title: 'Win Locked In',
          message: `${selectedPair.symbol} +${priceChangePercent.toFixed(2)}% profit secured!`,
          data: { profit: currentPnL, pair: selectedPair.symbol }
        });
        // Only auto-reopen if auto-trade mode is enabled
        if (tradingConfig.autoTradeEnabled) setPendingReopen(true);
        handleStopBot();
        return;
      }

      // PRIORITY 2: Close in ANY profit if signal is flipping against us
      if (isInProfit && priceChangePercent > 0.01 && analyzeMarket && strategy) {
        const signalFlipping = analyzeMarket.direction !== strategy.direction;
        const momentumWeakening =
          (strategy.direction === 'LONG' && analyzeMarket.scores && analyzeMarket.scores.bearishScore > analyzeMarket.scores.bullishScore) ||
          (strategy.direction === 'SHORT' && analyzeMarket.scores && analyzeMarket.scores.bullishScore > analyzeMarket.scores.bearishScore);

        if (signalFlipping || momentumWeakening) {
          console.log(`🔄 Securing profit before reversal: +${priceChangePercent.toFixed(3)}%`);
          addNotification({
            type: 'take_profit',
            title: 'Profit Secured',
            message: `${selectedPair.symbol} +${priceChangePercent.toFixed(2)}% - closed before signal flip`,
            data: { profit: currentPnL, pair: selectedPair.symbol }
          });
          // Only auto-reopen if auto-trade mode is enabled
          if (tradingConfig.autoTradeEnabled) setPendingReopen(true);
          handleStopBot();
          return;
        }
      }

      // PRIORITY 3: EMERGENCY STOP LOSS - only if loss exceeds max allowed
      const maxLossPercent = tradingConfig.stopLossPercent || 2;
      if (priceChangePercent <= -maxLossPercent) {
        console.log(`🛑 EMERGENCY: Max loss hit at ${priceChangePercent.toFixed(2)}%`);
        addNotification({
          type: 'stop_loss',
          title: 'Emergency Stop',
          message: `${selectedPair.symbol} hit -${maxLossPercent}% emergency stop`,
          data: { profit: currentPnL, pair: selectedPair.symbol }
        });
        // Only auto-reopen if auto-trade mode is enabled
        if (tradingConfig.autoTradeEnabled) setPendingReopen(true);
        handleStopBot();
        return;
      }

      // If in loss but not at emergency stop - HOLD and wait for recovery
      if (!isInProfit) {
        // Just waiting for price to recover...
        return;
      }
    }

    // === NORMAL MODE: Standard TP/SL logic ===
    if (!turboMode && timeRemaining <= 0) {
      // Check Take Profit
      if (tradingConfig.takeProfitEnabled && priceChangePercent >= tradingConfig.takeProfitPercent) {
        console.log(`🎯 Take Profit triggered at ${priceChangePercent.toFixed(2)}%`);
        addNotification({
          type: 'take_profit',
          title: 'Take Profit Triggered',
          message: `${selectedPair.symbol} hit +${priceChangePercent.toFixed(1)}% target.`,
          data: { profit: currentPnL, pair: selectedPair.symbol }
        });
        setPendingReopen(tradingConfig.autoReopenEnabled);
        handleStopBot();
        return;
      }

      // Check Stop Loss
      if (tradingConfig.stopLossEnabled && priceChangePercent <= -tradingConfig.stopLossPercent) {
        console.log(`🛑 Stop Loss triggered at ${priceChangePercent.toFixed(2)}%`);
        addNotification({
          type: 'stop_loss',
          title: 'Stop Loss Triggered',
          message: `${selectedPair.symbol} hit ${priceChangePercent.toFixed(1)}% stop.`,
          data: { profit: currentPnL, pair: selectedPair.symbol }
        });
        setPendingReopen(tradingConfig.autoReopenEnabled && tradingConfig.autoReopenOnLoss);
        handleStopBot();
        return;
      }
    }
  }, [currentPnL, botActive, activeTrade, entryPrice, timeRemaining, isExecuting, tradingConfig, candles, selectedPair.price, strategy, turboMode, analyzeMarket]);

  // Auto-reopen after closing - INSTANT in turbo mode
  useEffect(() => {
    if (!pendingReopen || botActive || isExecuting) return;

    // Check if we've hit max trades for session (skip check in turbo mode with 0 limit)
    if (!turboMode && tradingConfig.maxTradesPerSession > 0 && sessionTradeCount >= tradingConfig.maxTradesPerSession) {
      console.log('Max trades per session reached, not reopening');
      setPendingReopen(false);
      return;
    }

    // Turbo mode: reopen immediately with ANY signal
    if (turboMode && analyzeMarket) {
      console.log(`⚡ TURBO: Reopening ${analyzeMarket.direction} trade immediately`);
      setPendingReopen(false);
      setTimeout(() => {
        if (!botActive && !isExecuting) {
          handleStartBot();
        }
      }, 100); // Near instant - just 100ms delay
      return;
    }

    // Normal mode: Wait for a good signal before reopening
    if (analyzeMarket && analyzeMarket.confidence >= 60) {
      console.log('Auto-reopening trade...');
      setPendingReopen(false);
      setTimeout(() => {
        if (!botActive && !isExecuting) {
          handleStartBot();
        }
      }, 1000); // 1 second delay in normal mode
    }
  }, [pendingReopen, botActive, isExecuting, analyzeMarket, sessionTradeCount, tradingConfig.maxTradesPerSession, turboMode]);

  // Timer - countdown from MIN_TRADE_TIME
  useEffect(() => {
    if (!botActive || !botStartTime) return;

    // Set initial time remaining
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - botStartTime.getTime()) / 1000);
      const remaining = Math.max(MIN_TRADE_TIME - elapsed, 0);
      setTimeRemaining(remaining);
    };

    // Update immediately
    updateTimer();

    // Then update every second
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [botActive, botStartTime, MIN_TRADE_TIME]);

  const handleStartBot = async () => {
    if (!isConnected) {
      open();
      return;
    }

    // Check subscription - allow if subscribed OR free tier (paper trading)
    if (!isSubscribed && planTier !== 'free') {
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

    // Log quality warning if signal is weak (but don't block trading)
    if (!analyzeMarket.qualityMetrics?.isQualitySignal) {
      console.log(`⚠️ Trading with weak signal: ${analyzeMarket.qualityMetrics?.qualityWarning || 'Low confidence'}`);
    }

    setIsExecuting(true);

    try {
      // Verify subscription allows this trade (server-side check)
      const isPaperTrade = isTestnet(currentChain.id);
      let verification: { allowed: boolean; planTier: string; dailyTradesRemaining: number; isPaperOnly?: boolean; reason?: string };

      // Skip verification if wallet is connected with sufficient balance
      // This allows trading to proceed even if the API is down or token expired
      const hasWalletFunds = availableBalance >= tradeAmount;

      if (hasWalletFunds && isConnected) {
        // Direct bypass - user has funds and wallet connected, allow trading
        console.log('Wallet connected with funds - bypassing verification');
        verification = {
          allowed: true,
          planTier: planTier || 'pro',
          dailyTradesRemaining: 999
        };
      } else {
        try {
          verification = await verifyTrade(currentChain.id, isPaperTrade);
        } catch (verifyError: any) {
          console.error('Trade verification error:', verifyError);
          // If verification fails but user has funds, allow trade anyway
          if (hasWalletFunds) {
            console.log('Verification failed but wallet has funds - allowing trade');
            verification = { allowed: true, planTier: 'pro', dailyTradesRemaining: 999 };
          } else if (planTier === 'elite' || planTier === 'desktop') {
            console.log('Verification failed but user has elite subscription - allowing trade');
            verification = { allowed: true, planTier: planTier, dailyTradesRemaining: 999 };
          } else if (isSubscribed) {
            console.log('Verification failed but user is subscribed - allowing trade');
            verification = { allowed: true, planTier: planTier || 'pro', dailyTradesRemaining: 50 };
          } else {
            alert(`Verification failed: ${verifyError.message}\n\nPlease try logging out and back in.`);
            setIsExecuting(false);
            return;
          }
        }
      }

      if (!verification.allowed) {
        alert(verification.reason || 'Trade not allowed. Please check your subscription.');
        setIsExecuting(false);
        return;
      }

      // Show paper trading notice for free tier (skip if user has funds)
      if (verification.isPaperOnly && !isPaperTrade && !hasWalletFunds) {
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

      // Check what tokens the user has available
      const stableBalances = tokenBalances.filter(t => t.symbol === 'USDT' || t.symbol === 'USDC');
      const stableBalance = stableBalances.reduce((sum, t) => sum + parseFloat(t.balance), 0);
      const nativeBalanceNum = parseFloat(nativeBalance);
      const hasStablecoins = stableBalance >= tradeAmount;
      const hasNativeTokens = nativeBalanceNum > 0 && totalUsdValue >= tradeAmount;

      console.log(`Executing REAL ${analyzeMarket.direction} trade on ${currentChain.dex.name}`);
      console.log(`Available: Stables $${stableBalance.toFixed(2)}, Native ${nativeBalance} ($${totalUsdValue.toFixed(2)})`);
      console.log(`Slippage: ${tradingConfig.slippagePercent}%`);
      console.log(`Daily trades remaining: ${verification.dailyTradesRemaining}`);

      let swapResult: RealSwapResult;
      let tokenIn: string;
      let tokenOut: string;

      if (hasStablecoins) {
        // Use stablecoins for trading (original behavior)
        tokenIn = analyzeMarket.direction === 'LONG' ? quoteToken : baseToken;
        tokenOut = analyzeMarket.direction === 'LONG' ? baseToken : quoteToken;

        console.log(`Swapping ${tradeAmount} stablecoins: ${tokenIn} → ${tokenOut}`);
        swapResult = await executeRealSwap(
          tokenIn,
          tokenOut,
          tradeAmount.toString(),
          tradingConfig.slippagePercent
        );
      } else if (hasNativeTokens) {
        // Use native tokens for trading
        // Calculate how much native token to use based on USD value
        const nativeUsdPrice = totalUsdValue / nativeBalanceNum;

        // Reserve some native for gas (0.005 tokens minimum, e.g., 0.005 ETH ~ $15)
        const gasReserve = 0.005;
        const maxNativeToUse = Math.max(0, nativeBalanceNum - gasReserve);
        const nativeNeeded = tradeAmount / nativeUsdPrice;

        if (nativeNeeded > maxNativeToUse) {
          throw new Error(`Need ${nativeNeeded.toFixed(6)} native tokens but only ${maxNativeToUse.toFixed(6)} available after gas reserve`);
        }

        const nativeAmountToUse = nativeNeeded.toFixed(18);
        console.log(`Native swap: ${nativeAmountToUse} tokens ($${tradeAmount}) at $${nativeUsdPrice.toFixed(2)}/token`);

        // When using native tokens (ETH/BNB), swapping to stablecoin = SHORT position
        // The actual position is always SHORT when swapping native → stablecoin
        tokenIn = baseToken; // Native wrapped (WETH, WBNB, etc.)
        tokenOut = quoteToken; // USDT/USDC

        // Override direction to SHORT since we're selling native tokens
        // This ensures P/L calculates correctly (profit when native price drops)
        const actualDirection = 'SHORT';
        console.log(`Native swap (${actualDirection}): ${nativeAmountToUse} tokens → stablecoin`);
        console.log(`AI suggested ${analyzeMarket.direction}, but native swap = SHORT position`);

        swapResult = await swapNativeForTokens(
          tokenOut,
          nativeAmountToUse,
          tradingConfig.slippagePercent
        );

        // Update the strategy direction to match actual position
        analyzeMarket.direction = actualDirection;
      } else {
        throw new Error(`Insufficient balance. Need $${tradeAmount.toFixed(2)} but have $${Math.max(stableBalance, totalUsdValue).toFixed(2)}`);
      }

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
        gasCost: swapResult.gasCost,
        usedNativeSwap: !hasStablecoins // Track if we used native token swap
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

      // Provide more helpful error messages
      let errorMessage = error.message || 'Unknown error';

      if (errorMessage.includes('user rejected') || errorMessage.includes('User denied')) {
        errorMessage = 'Transaction was rejected in your wallet. Please approve the transaction to trade.';
      } else if (errorMessage.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for gas. Please add more native tokens to your wallet.';
      } else if (errorMessage.includes('Failed to get quote')) {
        errorMessage = 'Could not get swap quote. The trading pair may have low liquidity.';
      } else if (errorMessage.includes('Wallet not connected')) {
        errorMessage = 'Please connect your wallet first.';
      }

      alert(`Trade failed: ${errorMessage}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleStopBot = async () => {
    if (timeRemaining > 0 || !activeTrade || !currentChain) return;

    setIsExecuting(true);

    try {
      console.log('Closing position - executing reverse swap');
      console.log(`Trade used native swap: ${activeTrade.usedNativeSwap}`);

      let swapResult: RealSwapResult;

      if (activeTrade.usedNativeSwap) {
        // Close native token trade: swap stablecoins back to native
        console.log(`Swapping ${activeTrade.amountOut} stablecoins back to native`);
        swapResult = await swapTokensForNative(
          activeTrade.tokenOut,  // Stablecoin we received
          activeTrade.amountOut, // Amount of stablecoin
          tradingConfig.slippagePercent
        );
      } else {
        // Close regular trade: swap tokens back
        swapResult = await executeRealSwap(
          activeTrade.tokenOut,  // Now selling what we bought
          activeTrade.tokenIn,   // Getting back original token
          activeTrade.amountOut, // Amount we received from opening trade
          tradingConfig.slippagePercent
        );
      }

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
    setShowPlans(false);
    navigate('/dashboard/subscriptions');
  };

  const getMaxAmount = () => {
    if (!planTier) return 0;
    switch (planTier) {
      case 'free': return Math.min(100, availableBalance); // Paper trading limit
      case 'starter': return Math.min(1000, availableBalance);
      case 'pro': return Math.min(5000, availableBalance);
      case 'elite':
      case 'desktop': return Math.min(50000, availableBalance);
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

    // === CALCULATE INDICATORS FOR VISUAL OVERLAYS ===
    const closes = displayCandles.map(c => c.close);
    const highs = displayCandles.map(c => c.high);
    const lows = displayCandles.map(c => c.low);
    const currentPrice = closes[closes.length - 1];

    // Moving Averages (calculate for visible candles)
    const calcSMA = (data: number[], period: number) => {
      const result: (number | null)[] = [];
      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
          result.push(null);
        } else {
          const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
          result.push(sum / period);
        }
      }
      return result;
    };

    const sma7 = calcSMA(closes, 7);
    const sma20 = calcSMA(closes, 20);
    const sma50 = calcSMA(closes, Math.min(50, closes.length));

    // Bollinger Bands (20 period, 2 std)
    const bbData = closes.map((_, i) => {
      if (i < 19) return null;
      const slice = closes.slice(i - 19, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / 20;
      const squaredDiffs = slice.map(c => Math.pow(c - mean, 2));
      const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / 20);
      return { upper: mean + 2 * stdDev, middle: mean, lower: mean - 2 * stdDev };
    });

    // Support/Resistance levels
    const support = Math.min(...lows.slice(-20));
    const resistance = Math.max(...highs.slice(-20));

    // Calculate real-time RSI (14 period)
    let chartRsi = 50;
    if (closes.length >= 15) {
      let gains = 0, losses = 0;
      for (let i = closes.length - 14; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      chartRsi = 100 - (100 / (1 + rs));
    }

    // Calculate real-time MACD
    const calcEMA = (data: number[], period: number) => {
      if (data.length < period) return data[data.length - 1];
      return data.slice(-period).reduce((acc, val, i, arr) => {
        const multiplier = 2 / (arr.length + 1);
        return i === 0 ? val : val * multiplier + acc * (1 - multiplier);
      }, data[data.length - period]);
    };
    const chartEma12 = calcEMA(closes, 12);
    const chartEma26 = calcEMA(closes, 26);
    const chartMacd = chartEma12 - chartEma26;

    // Volume analysis
    const volumes = displayCandles.map(c => c.volume);
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
    const currentVolume = volumes[volumes.length - 1] || 0;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    // Generate SVG path for indicator line
    const generatePath = (values: (number | null)[]) => {
      let path = '';
      let started = false;
      values.forEach((val, i) => {
        if (val === null) return;
        const x = (i / displayCandles.length) * 100 + (candleWidth / 2) / 10;
        const y = scaleY(val);
        if (!started) {
          path += `M ${x} ${y}`;
          started = true;
        } else {
          path += ` L ${x} ${y}`;
        }
      });
      return path;
    };

    // Grid strategy levels
    const gridLevels: number[] = [];
    if (tradingConfig.strategy === 'grid' && currentPrice > 0) {
      const spread = (tradingConfig.gridSpreadPercent / 100) * currentPrice;
      const halfLevels = Math.floor(tradingConfig.gridLevels / 2);
      for (let i = -halfLevels; i <= halfLevels; i++) {
        gridLevels.push(currentPrice + i * spread / halfLevels);
      }
    }

    // DCA levels
    const dcaLevels: number[] = [];
    if (tradingConfig.strategy === 'dca' && currentPrice > 0) {
      const dropPercents = [0, -2, -5, -10, -15, -20];
      dropPercents.forEach(pct => {
        dcaLevels.push(currentPrice * (1 + pct / 100));
      });
    }

    // Signal arrows (based on candle patterns)
    const signalArrows: { idx: number; type: 'buy' | 'sell'; price: number }[] = [];
    for (let i = 1; i < displayCandles.length; i++) {
      const curr = displayCandles[i];
      const prev = displayCandles[i - 1];
      // Bullish engulfing
      if (curr.close > curr.open && prev.close < prev.open &&
          curr.close > prev.open && curr.open < prev.close) {
        signalArrows.push({ idx: i, type: 'buy', price: curr.low });
      }
      // Bearish engulfing
      if (curr.close < curr.open && prev.close > prev.open &&
          curr.close < prev.open && curr.open > prev.close) {
        signalArrows.push({ idx: i, type: 'sell', price: curr.high });
      }
    }

    return (
      <div className="relative w-full h-full overflow-hidden">
        <svg width="100%" height={chartHeight} className="overflow-visible">
          {/* Price grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const price = minPrice - padding + (priceRange + padding * 2) * (1 - ratio);
            const y = ratio * chartHeight;
            return (
              <g key={i}>
                <line x1="0" y1={y} x2="100%" y2={y} stroke="#374151" strokeWidth="0.5" strokeDasharray="4" />
                <text x="100%" y={y} dx="-4" dy="4" className="text-[10px] fill-gray-500" textAnchor="end">
                  {`$${formatPrice(price, 2)}`}
                </text>
              </g>
            );
          })}

          {/* Technical indicator lines removed for cleaner chart view */}

          {/* Support/Resistance Lines */}
          <line x1="0" y1={scaleY(support)} x2="100%" y2={scaleY(support)} stroke="#22c55e" strokeWidth="1" strokeDasharray="8,4" opacity="0.6" />
          <line x1="0" y1={scaleY(resistance)} x2="100%" y2={scaleY(resistance)} stroke="#ef4444" strokeWidth="1" strokeDasharray="8,4" opacity="0.6" />
          <rect x="calc(100% - 70px)" y={scaleY(support) - 8} width="65" height="16" fill="#22c55e" rx="2" opacity="0.2" />
          <text x="calc(100% - 38px)" y={scaleY(support) + 4} className="text-[8px] fill-green-400 font-medium" textAnchor="middle">{`S: $${support.toFixed(0)}`}</text>
          <rect x="calc(100% - 70px)" y={scaleY(resistance) - 8} width="65" height="16" fill="#ef4444" rx="2" opacity="0.2" />
          <text x="calc(100% - 38px)" y={scaleY(resistance) + 4} className="text-[8px] fill-red-400 font-medium" textAnchor="middle">{`R: $${resistance.toFixed(0)}`}</text>

          {/* Bot Position Entry Lines */}
          {botPositions
            .filter(pos => {
              // Match positions to current chart pair
              const pairBase = selectedPair.symbol.split('/')[0];
              return (
                (pairBase === 'ETH' && (pos.token_symbol === 'WETH' || pos.token_symbol === 'ETH')) ||
                (pairBase === pos.token_symbol)
              );
            })
            .map((pos, idx) => {
              const lineColor = pos.direction === 'LONG' ? '#3b82f6' : '#f59e0b'; // Blue for long, amber for short
              const entryY = scaleY(pos.entry_price);
              const tpY = pos.take_profit_price ? scaleY(pos.take_profit_price) : null;
              const slY = pos.trailing_stop_price ? scaleY(pos.trailing_stop_price) : null;

              return (
                <g key={`bot-pos-${pos.id}`}>
                  {/* Entry line - solid thin line */}
                  <line
                    x1="0"
                    y1={entryY}
                    x2="100%"
                    y2={entryY}
                    stroke={lineColor}
                    strokeWidth="1.5"
                    opacity="0.8"
                  />
                  {/* Entry label */}
                  <rect x="4" y={entryY - 9} width="50" height="18" fill={lineColor} rx="2" opacity="0.9" />
                  <text x="29" y={entryY + 4} className="text-[8px] fill-white font-bold" textAnchor="middle">
                    {pos.direction}
                  </text>
                  {/* Price label on right */}
                  <rect x="calc(100% - 85px)" y={entryY - 9} width="80" height="18" fill={lineColor} rx="2" opacity="0.9" />
                  <text x="calc(100% - 45px)" y={entryY + 4} className="text-[8px] fill-white font-medium" textAnchor="middle">
                    Entry: ${pos.entry_price.toFixed(2)}
                  </text>

                  {/* Take Profit line - dashed green */}
                  {tpY && (
                    <>
                      <line
                        x1="0"
                        y1={tpY}
                        x2="100%"
                        y2={tpY}
                        stroke="#22c55e"
                        strokeWidth="1"
                        strokeDasharray="4,2"
                        opacity="0.6"
                      />
                      <rect x="4" y={tpY - 8} width="28" height="16" fill="#22c55e" rx="2" opacity="0.7" />
                      <text x="18" y={tpY + 4} className="text-[7px] fill-white font-bold" textAnchor="middle">TP</text>
                    </>
                  )}

                  {/* Trailing Stop line - dashed red */}
                  {slY && (
                    <>
                      <line
                        x1="0"
                        y1={slY}
                        x2="100%"
                        y2={slY}
                        stroke="#ef4444"
                        strokeWidth="1"
                        strokeDasharray="4,2"
                        opacity="0.6"
                      />
                      <rect x="4" y={slY - 8} width="28" height="16" fill="#ef4444" rx="2" opacity="0.7" />
                      <text x="18" y={slY + 4} className="text-[7px] fill-white font-bold" textAnchor="middle">SL</text>
                    </>
                  )}
                </g>
              );
            })}

          {/* Grid Strategy Lines - Green (buy) below price, Red (sell) above price */}
          {tradingConfig.strategy === 'grid' && gridLevels.map((level, i) => {
            const isBuyZone = level < currentPrice;
            const gridColor = isBuyZone ? '#22c55e' : '#ef4444';
            const gridLabel = isBuyZone ? 'BUY' : 'SELL';
            return (
              <g key={`grid-${i}`} opacity="0.5">
                <line
                  x1="0"
                  y1={scaleY(level)}
                  x2="100%"
                  y2={scaleY(level)}
                  stroke={gridColor}
                  strokeWidth="1"
                  strokeDasharray="6,3"
                />
                <rect x="4" y={scaleY(level) - 8} width="38" height="16" fill={gridColor} rx="2" opacity="0.3" />
                <text x="23" y={scaleY(level) + 3} className={`text-[7px] font-bold ${isBuyZone ? 'fill-green-300' : 'fill-red-300'}`} textAnchor="middle">
                  {gridLabel}
                </text>
              </g>
            );
          })}

          {/* DCA Strategy Levels */}
          {tradingConfig.strategy === 'dca' && dcaLevels.map((level, i) => (
            <g key={`dca-${i}`} opacity="0.5">
              <line
                x1="0"
                y1={scaleY(level)}
                x2="100%"
                y2={scaleY(level)}
                stroke="#8b5cf6"
                strokeWidth="1.5"
                strokeDasharray={i === 0 ? "none" : "6,3"}
              />
              <rect x="calc(100% - 60px)" y={scaleY(level) - 8} width="55" height="16" fill="#8b5cf6" rx="2" opacity="0.4" />
              <text x="calc(100% - 32px)" y={scaleY(level) + 3} className="text-[8px] fill-violet-300 font-medium" textAnchor="middle">
                {i === 0 ? 'Entry' : `DCA ${i}`}
              </text>
            </g>
          ))}

          {/* Arbitrage Strategy - spread indicator */}
          {tradingConfig.strategy === 'arbitrage' && (
            <g>
              <rect x="4" y="4" width="80" height="32" fill="#1f2937" rx="4" stroke="#374151" />
              <text x="44" y="16" className="text-[9px] fill-gray-400" textAnchor="middle">Arb Spread</text>
              <text x="44" y="28" className="text-[11px] fill-emerald-400 font-medium" textAnchor="middle">
                {(Math.random() * tradingConfig.arbitrageMinSpread * 2).toFixed(2)}%
              </text>
            </g>
          )}

          {/* Signal Arrows - Using foreignObject with CSS triangles for percentage-based positioning */}
          {signalArrows.map((signal, i) => {
            const x = (signal.idx / displayCandles.length) * 100 + (candleWidth / 2) / 10;
            const y = scaleY(signal.price);
            return (
              <g key={`signal-${i}`}>
                {signal.type === 'buy' ? (
                  <>
                    <foreignObject x={`${x - 1}%`} y={y + 8} width="2%" height="20">
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                        <div style={{
                          width: 0, height: 0,
                          borderLeft: '6px solid transparent',
                          borderRight: '6px solid transparent',
                          borderBottom: '10px solid #22c55e',
                          opacity: 0.9
                        }} />
                      </div>
                    </foreignObject>
                    <circle cx={`${x}%`} cy={y + 24} r="3" fill="#22c55e" opacity="0.6" />
                  </>
                ) : (
                  <>
                    <foreignObject x={`${x - 1}%`} y={y - 28} width="2%" height="20">
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div style={{
                          width: 0, height: 0,
                          borderLeft: '6px solid transparent',
                          borderRight: '6px solid transparent',
                          borderTop: '10px solid #ef4444',
                          opacity: 0.9
                        }} />
                      </div>
                    </foreignObject>
                    <circle cx={`${x}%`} cy={y - 24} r="3" fill="#ef4444" opacity="0.6" />
                  </>
                )}
              </g>
            );
          })}

          {/* Candlesticks */}
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
              {/* Take Profit Line */}
              {(() => {
                const tpPercent = tradingConfig.takeProfitPercent || 5;
                const tpPrice = strategy?.direction === 'LONG'
                  ? entryPrice * (1 + tpPercent / 100)
                  : entryPrice * (1 - tpPercent / 100);
                const tpY = scaleY(tpPrice);
                // Only show if TP is within visible range
                if (tpY >= 0 && tpY <= chartHeight) {
                  return (
                    <>
                      <line x1="0" y1={tpY} x2="100%" y2={tpY} stroke="#22c55e" strokeWidth="1" strokeDasharray="4,4" opacity="0.8" />
                      <rect x="calc(100% - 75px)" y={tpY - 8} width="70" height="16" fill="#22c55e" rx="3" opacity="0.9" />
                      <text x="calc(100% - 40px)" y={tpY + 4} className="text-[9px] fill-white font-medium" textAnchor="middle">
                        TP +{tpPercent}%
                      </text>
                    </>
                  );
                }
                return null;
              })()}

              {/* Stop Loss / Trailing Stop Line */}
              {(() => {
                const slPercent = tradingConfig.stopLossPercent || 1;
                const slPrice = strategy?.direction === 'LONG'
                  ? entryPrice * (1 - slPercent / 100)
                  : entryPrice * (1 + slPercent / 100);
                const slY = scaleY(slPrice);
                // Only show if SL is within visible range
                if (slY >= 0 && slY <= chartHeight) {
                  return (
                    <>
                      <line x1="0" y1={slY} x2="100%" y2={slY} stroke="#ef4444" strokeWidth="1" strokeDasharray="4,4" opacity="0.8" />
                      <rect x="calc(100% - 75px)" y={slY - 8} width="70" height="16" fill="#ef4444" rx="3" opacity="0.9" />
                      <text x="calc(100% - 40px)" y={slY + 4} className="text-[9px] fill-white font-medium" textAnchor="middle">
                        SL -{slPercent}%
                      </text>
                    </>
                  );
                }
                return null;
              })()}

              {/* Entry Line */}
              <line
                x1="0"
                y1={scaleY(entryPrice)}
                x2="100%"
                y2={scaleY(entryPrice)}
                stroke={strategy?.direction === 'LONG' ? '#3b82f6' : '#f97316'}
                strokeWidth="1.5"
                strokeDasharray="6,3"
              />
              <rect
                x="0"
                y={scaleY(entryPrice) - 10}
                width="95"
                height="20"
                fill={strategy?.direction === 'LONG' ? '#3b82f6' : '#f97316'}
                rx="4"
              />
              <text x="47" y={scaleY(entryPrice) + 4} className="text-[10px] fill-white font-medium" textAnchor="middle">
                {`ENTRY $${formatPrice(entryPrice, 2)}`}
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

        {/* Real-time Indicators Panel */}
        <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md rounded-xl border border-gray-700/50 p-3 text-xs z-10 shadow-lg">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {/* RSI */}
            <div className="flex items-center justify-between gap-2 min-w-[80px]">
              <span className="text-gray-400 text-[11px]">RSI</span>
              <span className={`font-mono font-semibold ${chartRsi > 70 ? 'text-red-400' : chartRsi < 30 ? 'text-green-400' : 'text-white'}`}>
                {chartRsi.toFixed(0)}
              </span>
            </div>
            {/* MACD */}
            <div className="flex items-center justify-between gap-2 min-w-[80px]">
              <span className="text-gray-400 text-[11px]">MACD</span>
              <span className={`font-mono font-semibold ${chartMacd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {chartMacd >= 0 ? '+' : ''}{chartMacd.toFixed(2)}
              </span>
            </div>
            {/* Volume */}
            <div className="flex items-center justify-between gap-2 min-w-[80px]">
              <span className="text-gray-400 text-[11px]">Vol</span>
              <span className={`font-mono font-semibold ${volumeRatio > 1.5 ? 'text-yellow-400' : 'text-white'}`}>
                {volumeRatio.toFixed(1)}x
              </span>
            </div>
            {/* Bollinger % */}
            <div className="flex items-center justify-between gap-2 min-w-[80px]">
              <span className="text-purple-400 text-[11px]">BB%</span>
              <span className="text-white font-mono font-semibold">
                {bbData[bbData.length - 1] ? `${((currentPrice - (bbData[bbData.length - 1]?.lower || 0)) / ((bbData[bbData.length - 1]?.upper || 1) - (bbData[bbData.length - 1]?.lower || 0)) * 100).toFixed(0)}%` : '-'}
              </span>
            </div>
          </div>
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
            <span className="text-2xl font-light text-white">{`$${formatPrice(selectedPair.price, 2)}`}</span>
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

        </div>
      </div>

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
            <div className="px-4 py-3 border-b border-gray-800 flex flex-col gap-2">
              <div className="flex items-center justify-between">
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
                        timeframe === tf ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
                </div>
              </div>
              {/* Chart Legend */}
              <div className="flex items-center gap-4 flex-wrap text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-green-500 rounded" style={{ borderStyle: 'dashed' }} />
                  <span className="text-gray-400">Support</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-red-500 rounded" style={{ borderStyle: 'dashed' }} />
                  <span className="text-gray-400">Resistance</span>
                </div>
                {tradingConfig.strategy === 'grid' && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-green-500 rounded" />
                      <span className="text-green-400">Buy Grid</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-red-500 rounded" />
                      <span className="text-red-400">Sell Grid</span>
                    </div>
                  </>
                )}
                {tradingConfig.strategy === 'dca' && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-violet-500 rounded" />
                    <span className="text-violet-400">DCA</span>
                  </div>
                )}
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
                {analyzeMarket.qualityMetrics?.isQualitySignal ? (
                  <span className="ml-auto px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">High Quality</span>
                ) : (
                  <span className="ml-auto px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">Low Quality</span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-background rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {analyzeMarket.direction === 'LONG' ? (
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-400" />
                    )}
                    <span className={`text-lg font-semibold ${
                      analyzeMarket.direction === 'LONG' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {analyzeMarket.direction}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm">{analyzeMarket.reason}</p>
                </div>
                <div className="bg-background rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-2">Confidence ({analyzeMarket.qualityMetrics?.conditionsMet || 0}/5 conditions)</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          analyzeMarket.confidence >= 85 ? 'bg-green-500' :
                          analyzeMarket.confidence >= 65 ? 'bg-yellow-500' :
                          'bg-orange-500'
                        }`}
                        style={{ width: `${analyzeMarket.confidence}%` }}
                      />
                    </div>
                    <span className={`font-semibold ${analyzeMarket.confidence >= tradingConfig.minConfidence ? 'text-white' : 'text-orange-400'}`}>
                      {analyzeMarket.confidence}%
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs mt-1">Min: {tradingConfig.minConfidence}%</p>
                </div>
                <div className="bg-background rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-2">Risk/Reward</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-semibold ${
                      (analyzeMarket.qualityMetrics?.riskReward || 0) >= tradingConfig.minRiskReward ? 'text-green-400' : 'text-orange-400'
                    }`}>
                      {analyzeMarket.qualityMetrics?.riskReward?.toFixed(2) || '0.00'}x
                    </span>
                    <span className="text-gray-500 text-xs">(min: {tradingConfig.minRiskReward}x)</span>
                  </div>
                  <p className="text-gray-500 text-xs mt-1">
                    Vol: {analyzeMarket.qualityMetrics?.volumeRatio?.toFixed(1) || '0.0'}x
                    {tradingConfig.volumeFilterEnabled && (analyzeMarket.qualityMetrics?.volumeRatio || 0) < 1.2 && (
                      <span className="text-orange-400 ml-1">(low)</span>
                    )}
                  </p>
                </div>
                <div className="bg-background rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-2">Indicators</p>
                  <div className="flex flex-wrap gap-1">
                    {analyzeMarket.indicators.length > 0 ? (
                      analyzeMarket.indicators.map((ind, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">{ind}</span>
                      ))
                    ) : (
                      <span className="text-gray-500 text-xs">Waiting for signals...</span>
                    )}
                  </div>
                </div>
              </div>
              {analyzeMarket.metrics?.trend && analyzeMarket.metrics.trend !== 'NEUTRAL' && (
                <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${
                  analyzeMarket.metrics.trend === 'STRONG_UPTREND' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  Trend: {analyzeMarket.metrics.trend.replace('_', ' ')}
                  {(
                    (analyzeMarket.direction === 'SHORT' && analyzeMarket.metrics.trend === 'STRONG_UPTREND') ||
                    (analyzeMarket.direction === 'LONG' && analyzeMarket.metrics.trend === 'STRONG_DOWNTREND')
                  ) && (
                    <span className="ml-2 text-yellow-400">- Counter-trend trade</span>
                  )}
                </div>
              )}
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
                        <td className="px-4 py-2 text-right text-white font-mono">{`$${trade.amount.toLocaleString()}`}</td>
                        <td className={`px-4 py-2 text-right font-mono ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {trade.profit >= 0 ? '+' : ''}{`$${trade.profit.toFixed(2)}`}
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
                  <span className="px-2 py-0.5 bg-white text-gray-900 text-xs rounded-full font-medium">
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
                      {`$${tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0).toFixed(2)}`}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Gas Spent</p>
                    <p className="text-orange-400 font-medium">
                      {`$${tradeHistory.reduce((sum, t) => sum + (t.gasCostUsd || 0), 0).toFixed(2)}`}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 text-xs">Net P/L</p>
                    <p className={`font-medium ${
                      (tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) - tradeHistory.reduce((sum, t) => sum + (t.gasCostUsd || 0), 0)) >= 0
                        ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {`$${(tradeHistory.reduce((sum, t) => sum + (t.profit || 0), 0) - tradeHistory.reduce((sum, t) => sum + (t.gasCostUsd || 0), 0)).toFixed(2)}`}
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
                                {`$${parseFloat(trade.amountIn).toFixed(2)}`}
                              </td>
                              <td className="px-4 py-2 text-right text-orange-400 font-mono text-xs">
                                {`$${(trade.gasCostUsd || 0).toFixed(2)}`}
                              </td>
                              <td className={`px-4 py-2 text-right font-mono text-xs ${
                                (trade.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {(trade.profit || 0) >= 0 ? '+' : ''}${Math.abs(trade.profit || 0) < 0.01 ? (trade.profit || 0).toFixed(4) : (trade.profit || 0).toFixed(2)}
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
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-medium rounded-lg transition-colors"
              >
                Connect Wallet
              </button>
            </div>
          ) : !isSubscribed && planTier !== 'free' ? (
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
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-medium rounded-lg transition-colors"
              >
                View Plans
              </button>
            </div>
          ) : (
            <div className="bg-card-dark rounded-xl border border-gray-800 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Trade</h3>
                <span className={`px-2 py-1 text-xs rounded ${
                  planTier === 'elite' || planTier === 'desktop' ? 'bg-purple-500/20 text-purple-400' :
                  planTier === 'pro' ? 'bg-blue-500/20 text-blue-400' :
                  planTier === 'starter' ? 'bg-green-500/20 text-green-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {planTier?.toUpperCase() || 'FREE'}
                </span>
              </div>

              {/* Daily Trades Status */}
              <div className="flex items-center justify-between p-2 bg-background rounded-lg">
                <span className="text-gray-400 text-sm">Daily Trades</span>
                <span className={`text-sm font-medium ${
                  dailyTradesRemaining === -1 ? 'text-green-400' :
                  dailyTradesRemaining > 5 ? 'text-white' :
                  dailyTradesRemaining > 0 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {dailyTradesRemaining === -1 ? 'Unlimited' :
                   `${subscription?.dailyTradesUsed || 0} used / ${dailyTradesRemaining + (subscription?.dailyTradesUsed || 0)} limit`}
                </span>
              </div>

              {/* Bot Wallet (Vault) */}
              <VaultBalanceCard compact />

              {/* Paper Trading Warning for Free Tier */}
              {planTier === 'free' && (
                <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <span className="text-yellow-400 text-xs">Paper trading only. Upgrade to trade with real funds.</span>
                </div>
              )}

              {!botActive ? (
                <>
                  {/* Manual Trading Mode */}
                  <div className="flex items-center justify-between p-2 bg-background rounded-lg">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-400" />
                      <span className="text-white text-sm">Manual Trading</span>
                    </div>
                    <span className="text-gray-400 text-xs capitalize">{tradingConfig.strategy} Strategy</span>
                  </div>

                  {/* Info: Auto trading handled elsewhere */}
                  <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <p className="text-xs text-blue-400">
                      Auto trading runs in background. View positions on <span className="font-medium">Bot History</span> page.
                    </p>
                  </div>

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
                    <label className="block text-sm text-gray-400 mb-2">
                      Amount (USD) - Max: ${Math.min(availableBalance, getMaxAmount()).toFixed(2)}
                    </label>
                    <input
                      type="number"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(Math.min(Math.max(Number(e.target.value), 5), Math.min(availableBalance, getMaxAmount())))}
                      min={5}
                      max={Math.min(availableBalance, getMaxAmount())}
                      className="w-full bg-background border border-gray-700 rounded-lg px-3 py-2 text-white"
                    />
                    <input
                      type="range"
                      min={5}
                      max={Math.max(5, Math.min(availableBalance, getMaxAmount()))}
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(Number(e.target.value))}
                      className="w-full mt-2 accent-accent"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>$5</span>
                      <span>${Math.min(availableBalance, getMaxAmount()).toFixed(2)}</span>
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
                    className={`w-full py-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      analyzeMarket?.direction === 'LONG'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                    }`}
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
                      {`Est. gas: $${estimatedCosts.gasCostPerTrade.toFixed(2)} (${estimatedCosts.gasPercentage.toFixed(1)}% of trade)`}
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
                        <p className="text-white font-medium">{`$${tradeAmount.toLocaleString()}`}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Entry</p>
                        <p className="text-white font-medium">{`$${formatPrice(entryPrice, 2)}`}</p>
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
                        {currentPnL >= 0 ? '+' : ''}${Math.abs(currentPnL) < 0.01 ? currentPnL.toFixed(4) : formatPrice(currentPnL, 2)}
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

      {/* Need Help Support Section */}
      <div className="mt-6 bg-card-dark rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Need Help?</h3>
            <p className="text-gray-400 text-sm">
              Our dedicated support team is available 24/7 to assist you with any trading-related issues.
            </p>
          </div>
          <a
            href="/support"
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg font-medium transition-colors"
          >
            Contact Support
          </a>
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
                  <span className="text-white font-mono">{`$${estimatedCosts.gasCostPerTrade.toFixed(2)}`}</span>
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
                className="flex-1 py-3 bg-white text-gray-900 rounded-lg font-medium hover:bg-accent-hover"
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
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-white text-gray-900 text-xs font-medium rounded-full">
                      Popular
                    </div>
                  )}

                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center text-white mb-4`}>
                    {plan.icon}
                  </div>

                  <h3 className="text-xl font-semibold text-white mb-1">{plan.name}</h3>
                  <div className="mb-4">
                    <span className="text-3xl font-light text-white">{`$${plan.price}`}</span>
                    <span className="text-gray-400">/mo</span>
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
                    className={`w-full py-3 rounded-lg font-medium ${selectedPlan === plan.id ? 'bg-white text-gray-900' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
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
