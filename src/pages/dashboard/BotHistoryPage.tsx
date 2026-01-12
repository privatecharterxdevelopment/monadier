import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, TrendingUp, TrendingDown, Users, Trophy, Zap, Crown, Rocket, ExternalLink, RefreshCw, Activity, Clock, Timer, CheckCircle, XCircle, X, AlertTriangle, Settings, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { VAULT_ABI, VAULT_V4_ADDRESSES, VAULT_V3_ADDRESSES, VaultClient, VAULT_V2_ADDRESSES } from '../../lib/vault';
import VaultSettingsModal from '../../components/vault/VaultSettingsModal';

// Legacy trade format (from localStorage)
interface LegacyTrade {
  id: string;
  type: 'buy' | 'sell';
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  profit?: number;
  chainName: string;
  gasCostUsd?: number;
  timestamp: number;
  blockExplorerUrl?: string;
}

// Token address to symbol mapping (all chains)
const TOKEN_SYMBOLS: Record<string, string> = {
  // BASE
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  '0x4200000000000000000000000000000000000006': 'WETH',
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 'DAI',
  '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': 'cbETH',
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': 'USDbC',
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631': 'AERO',
  '0x0555e30da8f98308edb960aa94c0db47230d2b9c': 'WBTC',
  // ETHEREUM
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'WBTC',
  // POLYGON
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': 'WETH',
  '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': 'WMATIC',
  '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': 'WBTC',
  // ARBITRUM
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'WETH',
  '0x912ce59144191c1204e64559fe8253a0e49e6548': 'ARB',
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 'WBTC',
  // BSC
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': 'WBNB',
  '0x2170ed0880ac9a755fd29b2688956bd959f933f8': 'WETH',
  '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c': 'BTCB',
};

// Get token symbol from address or return shortened address
const getTokenSymbol = (addressOrSymbol: string): string => {
  if (!addressOrSymbol) return '???';

  // If it's already a symbol (no 0x prefix), return it
  if (!addressOrSymbol.startsWith('0x')) return addressOrSymbol;

  const lower = addressOrSymbol.toLowerCase();
  return TOKEN_SYMBOLS[lower] || `${addressOrSymbol.slice(0, 6)}...`;
};

// Block explorer URLs by chain ID
const BLOCK_EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  8453: 'https://basescan.org',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  56: 'https://bscscan.com',
};

// Get block explorer URL for address
const getExplorerUrl = (chainId: number, address: string): string => {
  const baseUrl = BLOCK_EXPLORERS[chainId] || 'https://basescan.org';
  return `${baseUrl}/address/${address}`;
};

interface Position {
  id: string;
  wallet_address: string;
  chain_id: number;
  token_address: string;
  token_symbol: string;
  direction: 'LONG' | 'SHORT';
  entry_price: number;
  entry_amount: number;
  token_amount: number;
  highest_price: number;
  lowest_price: number;
  trailing_stop_price: number | null;
  trailing_stop_percent: number;
  take_profit_price: number | null;
  take_profit_percent: number;
  stop_activated: boolean;
  exit_price: number | null;
  exit_amount: number | null;
  profit_loss: number | null;
  profit_loss_percent: number | null;
  status: 'open' | 'closing' | 'closed' | 'failed';
  close_reason: string | null;
  created_at: string;
  closed_at: string | null;
}

const BotHistoryPage: React.FC = () => {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [activeTab, setActiveTab] = useState<'open' | 'closed' | 'legacy' | 'all'>('open');
  const [positions, setPositions] = useState<Position[]>([]);
  const [legacyTrades, setLegacyTrades] = useState<LegacyTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalProfit: 0,
    realizedProfit: 0,
    unrealizedProfit: 0,
    winRate: 0,
    totalTrades: 0,
    closedTrades: 0,
    openPositions: 0,
    openWins: 0
  });
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; positionId: string | null; token: string; tokenAddress: string }>({
    show: false,
    positionId: null,
    token: '',
    tokenAddress: ''
  });

  // Bot Settings state - null means still loading
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [botSettingsLoaded, setBotSettingsLoaded] = useState(false);
  const [botSettings, setBotSettings] = useState({
    autoTradeEnabled: false,
    riskLevelPercent: 5,
    takeProfit: 5,
    stopLoss: 1
  });

  
  // Bot analysis status (what the bot is currently seeing)
  const [botAnalysis, setBotAnalysis] = useState<{
    signal: string;
    confidence: number;
    rsi: number;
    trend: string;
    pattern: string | null;
    recommendation: string;
    updated_at: string;
  } | null>(null);

  // Fetch bot settings
  useEffect(() => {
    const fetchBotSettings = async () => {
      if (!address || !chainId || !publicClient) return;

      try {
        // Get on-chain settings
        const vaultAddress = VAULT_V2_ADDRESSES[chainId as keyof typeof VAULT_V2_ADDRESSES];
        if (vaultAddress) {
          const vaultClient = new VaultClient(publicClient as any, null, chainId);
          const status = await vaultClient.getUserStatus(address as `0x${string}`);

          // Get TP/SL from Supabase
          const { data: vaultSettings } = await supabase
            .from('vault_settings')
            .select('take_profit_percent, stop_loss_percent')
            .eq('wallet_address', address.toLowerCase())
            .eq('chain_id', chainId)
            .single();

          setBotSettings({
            autoTradeEnabled: status.autoTradeEnabled,
            riskLevelPercent: status.riskLevelPercent,
            takeProfit: vaultSettings?.take_profit_percent || 5,
            stopLoss: vaultSettings?.stop_loss_percent || 1
          });

          setBotSettingsLoaded(true);
        }
      } catch (err) {
        console.error('Error fetching bot settings:', err);
        setBotSettingsLoaded(true); // Mark as loaded even on error
      }
    };

    fetchBotSettings();
  }, [address, chainId, publicClient]);

  // Fetch latest bot analysis for status display
  useEffect(() => {
    const fetchBotAnalysis = async () => {
      if (!chainId) return;

      try {
        const { data } = await supabase
          .from('bot_analysis')
          .select('signal, confidence, rsi, trend, pattern, recommendation, updated_at')
          .eq('chain_id', chainId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (data) {
          setBotAnalysis(data);
        }
      } catch (err) {
        // Analysis might not exist yet
      }
    };

    fetchBotAnalysis();
    // Refresh every 15 seconds to show latest analysis
    const interval = setInterval(fetchBotAnalysis, 15000);
    return () => clearInterval(interval);
  }, [chainId]);

  // Show confirmation modal
  const showCloseConfirm = (positionId: string, token: string, tokenAddress: string) => {
    setConfirmModal({ show: true, positionId, token, tokenAddress });
  };

  // Request close - Bot will close the position in next cycle (no ban)
  const requestClose = async () => {
    const positionId = confirmModal.positionId;
    if (!positionId) return;

    setConfirmModal({ show: false, positionId: null, token: '', tokenAddress: '' });
    setClosingPositionId(positionId);

    try {
      // Mark position for bot to close
      await supabase
        .from('positions')
        .update({
          status: 'closing',
          close_reason: 'user_requested'
        })
        .eq('id', positionId);

      console.log('Position marked for closing, bot will close in next cycle');

      // Refresh positions
      await fetchPositions();
    } catch (err: any) {
      console.error('Error requesting close:', err);
      await supabase
        .from('positions')
        .update({
          status: 'failed',
          close_reason: `User close failed: ${err.message?.slice(0, 100) || 'Unknown error'}`
        })
        .eq('id', positionId);
      await fetchPositions();
    } finally {
      setClosingPositionId(null);
    }
  };

  // Retry closing a failed position
  const retryClose = async (positionId: string) => {
    setClosingPositionId(positionId);

    try {
      // Reset status to 'closing' so bot will retry with higher slippage
      const { error } = await supabase
        .from('positions')
        .update({
          status: 'closing',
          close_reason: 'retry_close'
        })
        .eq('id', positionId);

      if (error) {
        console.error('Error retrying close:', error);
      } else {
        // Refresh positions
        await fetchPositions();
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setClosingPositionId(null);
    }
  };

  // Load legacy trades from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tradeHistory');
    if (saved) {
      try {
        const trades = JSON.parse(saved) as LegacyTrade[];
        setLegacyTrades(trades);
      } catch {
        setLegacyTrades([]);
      }
    }
  }, []);

  // State for all positions (for stats calculation)
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const fetchPositions = async (showLoading = false) => {
    if (!address) return;

    // Only show loading spinner on initial load, not refreshes
    if (showLoading || isInitialLoad) {
      setLoading(true);
    }
    try {
      // DEBUG: Log which wallet we're fetching for
      console.log('[BotHistory] Fetching positions for wallet:', address.toLowerCase());

      // Always fetch ALL positions for stats
      const { data: allData, error: allError } = await supabase
        .from('positions')
        .select('*')
        .eq('wallet_address', address.toLowerCase())
        .order('created_at', { ascending: false });

      if (allError) {
        console.error('Error fetching positions:', allError);
        return;
      }

      // DEBUG: Log fetched positions
      console.log('[BotHistory] Fetched positions:', allData?.length || 0);
      allData?.forEach(p => {
        console.log(`[BotHistory] - ${p.status} ${p.direction} ${p.token_symbol} | wallet: ${p.wallet_address?.slice(0,10)}... | P/L: $${p.profit_loss || 'N/A'}`);
      });

      setAllPositions(allData || []);

      // Filter for display based on active tab
      let displayData = allData || [];
      if (activeTab === 'open') {
        displayData = displayData.filter(p => p.status === 'open' || p.status === 'closing');
      } else if (activeTab === 'closed') {
        // Include both closed and failed positions
        displayData = displayData.filter(p => p.status === 'closed' || p.status === 'failed');
      }

      setPositions(displayData);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  useEffect(() => {
    fetchPositions(true); // Show loading on initial fetch

    // Refresh every 10 seconds without showing loading spinner
    const interval = setInterval(() => fetchPositions(false), 10000);
    return () => clearInterval(interval);
  }, [address, activeTab]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format exact time (HH:MM:SS)
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // Format duration as HH:MM:SS or Xd HH:MM
  const formatDuration = (startDate: string, endDate?: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diffMs = end.getTime() - start.getTime();

    const seconds = Math.floor(diffMs / 1000) % 60;
    const minutes = Math.floor(diffMs / (1000 * 60)) % 60;
    const hours = Math.floor(diffMs / (1000 * 60 * 60)) % 24;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (days > 0) {
      return `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Live timer state for open positions
  const [timerTick, setTimerTick] = useState(0);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  // Update timer every second for live positions
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch live prices from Binance for all tradable tokens
  const fetchLivePrices = async () => {
    try {
      // Fetch all prices we need in one call
      const symbols = ['ETHUSDT', 'BTCUSDT', 'BNBUSDT', 'MATICUSDT', 'ARBUSDT'];
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${JSON.stringify(symbols)}`);
      const data = await response.json();

      if (Array.isArray(data)) {
        const ethPrice = data.find((t: any) => t.symbol === 'ETHUSDT')?.price;
        const btcPrice = data.find((t: any) => t.symbol === 'BTCUSDT')?.price;
        const bnbPrice = data.find((t: any) => t.symbol === 'BNBUSDT')?.price;
        const maticPrice = data.find((t: any) => t.symbol === 'MATICUSDT')?.price;
        const arbPrice = data.find((t: any) => t.symbol === 'ARBUSDT')?.price;

        setLivePrices({
          // ETH variants
          'WETH': ethPrice ? parseFloat(ethPrice) : 0,
          'ETH': ethPrice ? parseFloat(ethPrice) : 0,
          'cbETH': ethPrice ? parseFloat(ethPrice) : 0,
          // BTC variants
          'WBTC': btcPrice ? parseFloat(btcPrice) : 0,
          'BTC': btcPrice ? parseFloat(btcPrice) : 0,
          'BTCB': btcPrice ? parseFloat(btcPrice) : 0,
          // Other chains
          'WBNB': bnbPrice ? parseFloat(bnbPrice) : 0,
          'BNB': bnbPrice ? parseFloat(bnbPrice) : 0,
          'WMATIC': maticPrice ? parseFloat(maticPrice) : 0,
          'MATIC': maticPrice ? parseFloat(maticPrice) : 0,
          'ARB': arbPrice ? parseFloat(arbPrice) : 0,
        });
      }
    } catch (err) {
      console.error('Failed to fetch live prices:', err);
    }
  };

  // Fetch prices on mount and every 5 seconds
  useEffect(() => {
    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 5000);
    return () => clearInterval(interval);
  }, []);

  // Calculate live stats including open positions
  useEffect(() => {
    if (allPositions.length === 0) return;

    const closedPositions = allPositions.filter(p => p.status === 'closed');
    const failedPositions = allPositions.filter(p => p.status === 'failed');
    const openPositions = allPositions.filter(p => p.status === 'open' || p.status === 'closing');

    // Closed P/L - sum of all recorded profit_loss from closed trades
    const closedProfit = closedPositions.reduce((sum, p) => sum + (p.profit_loss || 0), 0);

    // Live P/L from open positions (price-based calculation, direction-aware)
    // Must match getCurrentProfit() logic exactly for consistency!
    const openProfit = openPositions.reduce((sum, p) => {
      const tokenSymbol = p.token_symbol || 'WETH';
      // Same fallback chain as getCurrentProfit: livePrices -> highest_price -> entry_price
      const currentPrice = livePrices[tokenSymbol] || p.highest_price || p.entry_price;

      // Calculate P/L based on price change (not token amounts - more accurate)
      const priceChange = p.direction === 'SHORT'
        ? p.entry_price - currentPrice  // SHORT: profit when price drops
        : currentPrice - p.entry_price; // LONG: profit when price rises

      const profitPercent = (priceChange / p.entry_price) * 100;
      const positionPL = (p.entry_amount * profitPercent) / 100;

      // Debug log each position's P/L calculation
      console.log(`[Stats] ${p.token_symbol} ${p.direction}: entry=${p.entry_price}, current=${currentPrice}, PL=$${positionPL.toFixed(4)}`);

      return sum + positionPL;
    }, 0);

    // Debug log totals
    console.log(`[Stats] closedPositions: ${closedPositions.length}, openPositions: ${openPositions.length}, failedPositions: ${failedPositions.length}`);
    console.log(`[Stats] Closed P/L: $${closedProfit.toFixed(4)}, Open P/L: $${openProfit.toFixed(4)}, Total: $${(closedProfit + openProfit).toFixed(4)}`);

    // Total P/L = closed + open (live)
    const totalProfit = closedProfit + openProfit;

    // Win rate for closed trades
    const closedWins = closedPositions.filter(p => (p.profit_loss || 0) > 0).length;
    const closedWinRate = closedPositions.length > 0 ? (closedWins / closedPositions.length) * 100 : 0;

    // Open trades currently in profit (same price logic as above)
    const openWins = openPositions.filter(p => {
      const tokenSymbol = p.token_symbol || 'WETH';
      const currentPrice = livePrices[tokenSymbol] || p.highest_price || p.entry_price;
      if (p.direction === 'SHORT') {
        return currentPrice < p.entry_price;
      }
      return currentPrice > p.entry_price;
    }).length;

    setStats({
      totalProfit,
      realizedProfit: closedProfit,
      unrealizedProfit: openProfit,
      winRate: closedWinRate,
      totalTrades: closedPositions.length + failedPositions.length + openPositions.length,
      closedTrades: closedPositions.length + failedPositions.length, // Include failed in closed count
      openPositions: openPositions.length,
      openWins
    });
  }, [allPositions, livePrices]);

  const getCurrentProfit = (position: Position) => {
    // Closed positions: use recorded P/L
    if (position.status === 'closed') {
      return position.profit_loss || 0;
    }
    // Failed positions: show 0 or last known P/L (not live)
    if (position.status === 'failed') {
      return position.profit_loss || 0;
    }
    // For open/closing positions, calculate P/L based on PRICE change (not token amounts)
    // This is more accurate since token amounts are estimated and don't account for swap fees
    const tokenSymbol = position.token_symbol || 'WETH';
    const currentPrice = livePrices[tokenSymbol] || position.highest_price || position.entry_price;

    // Calculate P/L based on price difference (direction-aware)
    const priceChange = position.direction === 'SHORT'
      ? position.entry_price - currentPrice  // SHORT: profit when price drops
      : currentPrice - position.entry_price; // LONG: profit when price rises

    const profitPercent = (priceChange / position.entry_price) * 100;
    return (position.entry_amount * profitPercent) / 100;
  };

  const getProfitPercent = (position: Position) => {
    // Closed or failed: use recorded P/L percent
    if (position.status === 'closed' || position.status === 'failed') {
      return position.profit_loss_percent || 0;
    }
    // Open/closing: calculate from live price
    const tokenSymbol = position.token_symbol || 'WETH';
    const currentPrice = livePrices[tokenSymbol] || position.entry_price;

    if (position.direction === 'SHORT') {
      return ((position.entry_price - currentPrice) / position.entry_price) * 100;
    }
    return ((currentPrice - position.entry_price) / position.entry_price) * 100;
  };

  // Get current live price for display
  const getCurrentPrice = (position: Position) => {
    const tokenSymbol = position.token_symbol || 'WETH';
    return livePrices[tokenSymbol] || position.entry_price;
  };

  // Calculate breakeven price (accounts for 1% platform fee + 0.3% swap fees x2)
  // Total fees: ~1.6% for round trip
  const TOTAL_FEE_PERCENT = 1.6;
  const getBreakevenPrice = (position: Position) => {
    if (position.direction === 'LONG') {
      // LONG: Need price to go up by fee % to break even
      return position.entry_price * (1 + TOTAL_FEE_PERCENT / 100);
    } else {
      // SHORT: Need price to go down by fee % to break even
      return position.entry_price * (1 - TOTAL_FEE_PERCENT / 100);
    }
  };

  // Calculate distance to breakeven
  const getBreakevenDistance = (position: Position) => {
    const currentPrice = getCurrentPrice(position);
    const breakevenPrice = getBreakevenPrice(position);

    // For both directions: positive = needs to move towards profit, negative = already past BE
    let distancePercent: number;
    let isProfitable: boolean;

    if (position.direction === 'LONG') {
      // LONG: Profitable when current >= BE, distance is how much current needs to rise
      isProfitable = currentPrice >= breakevenPrice;
      distancePercent = ((breakevenPrice - currentPrice) / currentPrice) * 100;
    } else {
      // SHORT: Profitable when current <= BE, distance is how much current needs to drop
      isProfitable = currentPrice <= breakevenPrice;
      // Negative = price needs to drop to reach BE
      distancePercent = ((breakevenPrice - currentPrice) / currentPrice) * 100;
    }

    return {
      price: breakevenPrice,
      distancePercent,
      isProfitable
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bot Trading History</h1>
          <p className="text-secondary mt-1">View your positions and profits</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowInfoPopup(!showInfoPopup)}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
              title="Trading Info"
            >
              <Info size={18} />
            </button>
            {/* Info Popup */}
            <AnimatePresence>
              {showInfoPopup && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="fixed right-4 top-32 w-80 bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-xl z-50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-white font-medium">Trading Info</h4>
                    <button onClick={() => setShowInfoPopup(false)} className="text-zinc-400 hover:text-white">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-amber-400 font-medium mb-1">
                        <AlertTriangle size={14} />
                        Fee Structure
                      </div>
                      <p className="text-amber-200/80">
                        1% platform fee + 0.3% swap fee (×2) = <strong>~1.6% breakeven</strong>. Price must move +1.6% above entry to be net profitable.
                      </p>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-blue-400 font-medium mb-1">
                        <Zap size={14} />
                        Slippage
                      </div>
                      <p className="text-blue-200/80">
                        Price can move before your tx confirms. If it moves more than tolerance, trade is rejected. Bot auto-retries: 5% → 10% → 15% → 20%.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 hover:border-blue-500/50 rounded-lg text-white transition-all"
          >
            <Settings size={16} />
            Bot Settings
          </button>
          <button
            onClick={fetchPositions}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Current Bot Settings Summary - Only show when loaded */}
      {botSettingsLoaded && (
        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${botSettings.autoTradeEnabled ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-white font-medium">
                {botSettings.autoTradeEnabled ? 'Auto-Trading Active' : 'Auto-Trading Off'}
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">Risk:</span>
                <span className="text-white font-medium">{botSettings.riskLevelPercent}%</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-green-400" />
                <span className="text-zinc-400">TP:</span>
                <span className="text-green-400 font-medium">{botSettings.takeProfit}%</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingDown size={14} className="text-red-400" />
                <span className="text-zinc-400">SL:</span>
                <span className="text-red-400 font-medium">{botSettings.stopLoss}%</span>
              </div>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="text-blue-400 hover:text-blue-300 text-xs underline"
              >
                Edit Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards - Row 1: Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stats.totalProfit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              {stats.totalProfit >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-400" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-400" />
              )}
            </div>
            <div>
              <p className="text-sm text-secondary">Total P/L (Live)</p>
              <p className={`text-xl font-bold ${stats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.totalProfit >= 0 ? '+' : ''}${stats.totalProfit.toFixed(4)}
              </p>
              <div className="flex gap-2 text-[10px] mt-1">
                <span className={stats.realizedProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                  Realized: {stats.realizedProfit >= 0 ? '+' : ''}${stats.realizedProfit.toFixed(4)}
                </span>
                <span className={stats.unrealizedProfit >= 0 ? 'text-blue-400' : 'text-orange-400'}>
                  Open: {stats.unrealizedProfit >= 0 ? '+' : ''}${stats.unrealizedProfit.toFixed(4)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-secondary">Win Rate (Closed)</p>
              <p className="text-xl font-bold text-white">{stats.winRate.toFixed(1)}%</p>
              <p className="text-[10px] text-secondary mt-1">
                {stats.closedTrades} closed trades
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-secondary">Open Positions</p>
              <p className="text-xl font-bold text-white">{stats.openPositions}</p>
              <p className="text-[10px] mt-1">
                <span className="text-green-400">{stats.openWins} in profit</span>
                {stats.openPositions > stats.openWins && (
                  <span className="text-red-400 ml-2">{stats.openPositions - stats.openWins} in loss</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <History className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-secondary">Total Trades</p>
              <p className="text-xl font-bold text-white">{stats.totalTrades}</p>
              <p className="text-[10px] text-secondary mt-1">
                {stats.openPositions} open, {stats.closedTrades} closed
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 p-1 bg-card-dark rounded-lg w-fit border border-gray-800">
        <button
          onClick={() => setActiveTab('open')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
            activeTab === 'open'
              ? 'bg-white text-gray-900'
              : 'text-secondary hover:text-white'
          }`}
        >
          <Activity size={18} />
          Open
          {stats.openPositions > 0 && (
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('closed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
            activeTab === 'closed'
              ? 'bg-white text-gray-900'
              : 'text-secondary hover:text-white'
          }`}
        >
          <History size={18} />
          Closed ({stats.closedTrades})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
            activeTab === 'all'
              ? 'bg-white text-gray-900'
              : 'text-secondary hover:text-white'
          }`}
        >
          All Bot Trades
        </button>
        {/* Only show Manual tab if there are legacy trades */}
        {legacyTrades.length > 0 && (
          <button
            onClick={() => setActiveTab('legacy')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
              activeTab === 'legacy'
                ? 'bg-white text-gray-900'
                : 'text-secondary hover:text-white'
            }`}
          >
            <Zap size={18} />
            Manual ({legacyTrades.length})
          </button>
        )}
      </div>

      {/* Positions Table */}
      <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-9 gap-4 px-4 py-3 bg-background border-b border-gray-800 text-sm font-medium text-secondary">
          <div>Token</div>
          <div>Direction</div>
          <div>Entry / Now</div>
          <div>Size</div>
          <div>TP / SL</div>
          <div>P/L (Live)</div>
          <div>Duration</div>
          <div>Status</div>
          <div>Action</div>
        </div>

        {/* Body */}
        <div className="max-h-[500px] overflow-y-auto">
          {/* Legacy Trades Tab */}
          {activeTab === 'legacy' ? (
            legacyTrades.length === 0 ? (
              <div className="py-12 text-center">
                <History className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-secondary">No previous trades</p>
              </div>
            ) : (
              <AnimatePresence>
                {legacyTrades.map((trade, index) => {
                  const profit = trade.profit || 0;
                  const isProfit = profit >= 0;

                  return (
                    <motion.div
                      key={trade.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ delay: index * 0.05 }}
                      className="grid grid-cols-8 gap-4 px-4 py-3 border-b border-gray-800 hover:bg-surface-hover transition-colors items-center"
                    >
                      {/* Token */}
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">
                          {getTokenSymbol(trade.tokenIn)}/{getTokenSymbol(trade.tokenOut)}
                        </span>
                      </div>

                      {/* Direction */}
                      <div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          trade.type === 'buy'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {trade.type.toUpperCase()}
                        </span>
                      </div>

                      {/* Amount In */}
                      <div className="text-white font-mono text-sm">
                        {trade.amountIn}
                      </div>

                      {/* Amount Out */}
                      <div className="text-white font-mono text-sm">
                        {trade.amountOut}
                      </div>

                      {/* Chain */}
                      <div className="text-secondary text-sm">
                        {trade.chainName}
                      </div>

                      {/* P/L */}
                      <div className={`flex items-center gap-1 font-mono text-sm ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                        {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        <div>
                          {isProfit ? '+' : ''}${profit.toFixed(2)}
                        </div>
                      </div>

                      {/* Gas */}
                      <div className="text-secondary text-sm">
                        Gas: ${(trade.gasCostUsd || 0).toFixed(2)}
                      </div>

                      {/* Date + Link */}
                      <div className="flex items-center gap-2">
                        <span className="text-secondary text-sm">
                          {new Date(trade.timestamp).toLocaleString()}
                        </span>
                        {trade.blockExplorerUrl && (
                          <a
                            href={trade.blockExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )
          ) : loading ? (
            <div className="py-12 text-center">
              <RefreshCw className="w-8 h-8 text-gray-600 mx-auto mb-3 animate-spin" />
              <p className="text-secondary">Loading positions...</p>
            </div>
          ) : positions.length === 0 ? (
            <div className="py-6">
              {activeTab === 'open' && botSettings.autoTradeEnabled ? (
                // Show bot status inline when auto-trade is enabled - no card
                <div className="flex items-center justify-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-accent animate-pulse" />
                    <span className="text-gray-400">Analyzing market...</span>
                  </div>
                  {botAnalysis ? (
                    <>
                      <span className="text-gray-600">•</span>
                      <span className={botAnalysis.signal === 'LONG' ? 'text-green-400' : botAnalysis.signal === 'SHORT' ? 'text-red-400' : 'text-gray-400'}>
                        {botAnalysis.signal}
                      </span>
                      <span className="text-gray-600">•</span>
                      <span className={`${botAnalysis.confidence >= 60 ? 'text-green-400' : botAnalysis.confidence >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {botAnalysis.confidence}% conf.
                      </span>
                      <span className="text-gray-600">•</span>
                      <span className="text-gray-400">RSI {botAnalysis.rsi}</span>
                      {botAnalysis.pattern && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span className="text-accent">{botAnalysis.pattern}</span>
                        </>
                      )}
                      <span className="text-gray-600">•</span>
                      <span className="text-gray-500 text-xs">
                        {botAnalysis.recommendation?.split(' - ')[0] || 'Waiting...'}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-500">Checking every 10s</span>
                  )}
                </div>
              ) : activeTab === 'open' && !botSettings.autoTradeEnabled ? (
                // Bot is not enabled
                <div className="text-center">
                  <p className="text-secondary">No open positions</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Enable auto-trading to let the bot open positions automatically
                  </p>
                </div>
              ) : (
                // Closed/All tabs - no positions
                <div className="text-center">
                  <p className="text-secondary">No {activeTab} positions</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Completed trades will appear here
                  </p>
                </div>
              )}
            </div>
          ) : (
            <AnimatePresence>
              {positions.map((position, index) => {
                const profit = getCurrentProfit(position);
                const profitPercent = getProfitPercent(position);
                const isProfit = profit >= 0;

                return (
                  <motion.div
                    key={position.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ delay: index * 0.05 }}
                    className="grid grid-cols-9 gap-4 px-4 py-3 border-b border-gray-800 hover:bg-surface-hover transition-colors items-center"
                  >
                    {/* Token */}
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{position.token_symbol || 'WETH'}</span>
                    </div>

                    {/* Direction */}
                    <div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        position.direction === 'LONG'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {position.direction || 'LONG'}
                      </span>
                    </div>

                    {/* Entry Price + Current Price */}
                    <div className="text-sm">
                      <div className="text-white font-mono">
                        ${(position.entry_price || 0).toFixed(2)}
                      </div>
                      {position.status === 'open' && livePrices[position.token_symbol || 'WETH'] && (
                        <div className={`text-xs font-mono ${
                          getCurrentPrice(position) >= position.entry_price ? 'text-green-400' : 'text-red-400'
                        }`}>
                          → ${getCurrentPrice(position).toFixed(2)}
                        </div>
                      )}
                    </div>

                    {/* Size */}
                    <div className="text-white font-mono text-sm">
                      ${(position.entry_amount || 0).toFixed(2)}
                    </div>

                    {/* TP / SL / BE */}
                    <div className="text-xs">
                      <div className="text-green-400">
                        TP: {position.take_profit_percent || 5}%
                      </div>
                      <div className={position.stop_activated ? 'text-amber-400' : 'text-gray-500'}>
                        SL: {position.trailing_stop_percent || 1}% {position.stop_activated ? '✓' : ''}
                      </div>
                      {position.status === 'open' && (() => {
                        const be = getBreakevenDistance(position);
                        // Format distance: show arrow direction for clarity
                        const formatDistance = () => {
                          if (be.isProfitable) return '✓ profit zone';
                          const absDistance = Math.abs(be.distancePercent).toFixed(2);
                          if (position.direction === 'LONG') {
                            return `↑${absDistance}% to BE`;
                          } else {
                            return `↓${absDistance}% to BE`;
                          }
                        };
                        return (
                          <div className={`mt-0.5 ${be.isProfitable ? 'text-green-400' : 'text-orange-400'}`}>
                            BE: ${be.price.toFixed(2)}
                            <span className="opacity-75 ml-1">
                              ({formatDistance()})
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* P/L */}
                    <div className={`flex items-center gap-1 font-mono text-sm ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                      {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      <div>
                        <div>{isProfit ? '+' : ''}${Math.abs(profit) < 0.001 ? profit.toFixed(4) : profit.toFixed(3)}</div>
                        <div className="text-xs opacity-75">
                          ({isProfit ? '+' : ''}{profitPercent.toFixed(3)}%)
                        </div>
                      </div>
                    </div>

                    {/* Duration / Timer */}
                    <div className="text-sm">
                      {position.status === 'open' ? (
                        <div className="flex items-center gap-1.5">
                          <Timer size={14} className="text-blue-400 animate-pulse" />
                          <span className="font-mono text-blue-400">
                            {formatDuration(position.created_at)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} className="text-gray-400" />
                          <span className="font-mono text-gray-400">
                            {formatDuration(position.created_at, position.closed_at)}
                          </span>
                        </div>
                      )}
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Opened: {formatTime(position.created_at)}
                      </div>
                    </div>

                    {/* Status */}
                    <div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        position.status === 'open' ? 'bg-blue-500/20 text-blue-400' :
                        position.status === 'closed' ? 'bg-gray-500/20 text-gray-400' :
                        position.status === 'closing' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {position.status.toUpperCase()}
                      </span>
                      {position.close_reason && (
                        <div className={`text-xs mt-1 ${
                          position.status === 'failed' ? 'text-red-400' : 'text-gray-500'
                        }`}>
                          {position.close_reason === 'take_profit' ? 'TP Hit' :
                           position.close_reason === 'trailing_stop' ? 'Stop' :
                           position.close_reason === 'emergency_close' ? 'Manual' :
                           position.close_reason.includes('State mismatch') ? 'Sync Error' :
                           position.close_reason.includes('INSUFFICIENT_OUTPUT') ? 'Slippage Error' :
                           position.close_reason.includes('0xe4455cae') ? 'No Balance' :
                           position.close_reason.includes('revert') ? 'TX Failed' :
                           position.close_reason.length > 20 ? 'Error' :
                           position.close_reason}
                        </div>
                      )}
                    </div>

                    {/* Result / Actions */}
                    <div className="flex items-center gap-2">
                      {position.status === 'closed' ? (
                        <div className="flex items-center gap-2">
                          {isProfit ? (
                            <div className="flex items-center gap-1.5 text-green-400">
                              <CheckCircle size={18} />
                              <span className="font-medium">WIN</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-red-400">
                              <XCircle size={18} />
                              <span className="font-medium">LOSS</span>
                            </div>
                          )}
                          <a
                            href={getExplorerUrl(position.chain_id, position.wallet_address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-white/10 rounded text-blue-400 hover:text-blue-300 transition-colors"
                            title="View on block explorer"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      ) : position.status === 'open' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => showCloseConfirm(position.id, position.token_symbol || 'WETH', position.token_address)}
                            disabled={closingPositionId === position.id}
                            className="flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {closingPositionId === position.id ? (
                              <>
                                <RefreshCw size={12} className="animate-spin" />
                                Closing...
                              </>
                            ) : (
                              <>
                                <X size={12} />
                                Close
                              </>
                            )}
                          </button>
                          <a
                            href={getExplorerUrl(position.chain_id, position.wallet_address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-white/10 rounded text-blue-400 hover:text-blue-300 transition-colors"
                            title="View on block explorer"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      ) : position.status === 'closing' ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-amber-400">
                            <RefreshCw size={14} className="animate-spin" />
                            <span className="text-xs">Closing...</span>
                          </div>
                          <a
                            href={getExplorerUrl(position.chain_id, position.wallet_address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-white/10 rounded text-blue-400 hover:text-blue-300 transition-colors"
                            title="View on block explorer"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      ) : position.status === 'failed' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => retryClose(position.id)}
                            disabled={closingPositionId === position.id}
                            className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 hover:bg-amber-500/40 text-amber-400 rounded text-xs font-medium transition-colors disabled:opacity-50"
                            title="Retry closing this position with higher slippage tolerance"
                          >
                            {closingPositionId === position.id ? (
                              <>
                                <RefreshCw size={12} className="animate-spin" />
                                Retrying...
                              </>
                            ) : (
                              <>
                                <RefreshCw size={12} />
                                Retry
                              </>
                            )}
                          </button>
                          <div className="text-red-400" title={
                            position.close_reason?.includes('INSUFFICIENT_OUTPUT') ? 'Slippage: Price moved too much during swap. Click Retry to try with higher tolerance.' :
                            position.close_reason?.includes('0xe4455cae') ? 'No tokens found on-chain. Position may already be closed.' :
                            position.close_reason?.includes('State mismatch') ? 'Blockchain sync issue. Tokens may already be sold.' :
                            'Transaction failed. Click Retry to try again.'
                          }>
                            <AlertTriangle size={16} />
                          </div>
                          <a
                            href={getExplorerUrl(position.chain_id, position.wallet_address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-white/10 rounded text-blue-400 hover:text-blue-300 transition-colors"
                            title="View on block explorer"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setConfirmModal({ show: false, positionId: null, token: '', tokenAddress: '' })}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card-dark border border-gray-700 rounded-xl p-6 max-w-md mx-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <X className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Close Position?</h3>
                  <p className="text-sm text-secondary">Close {confirmModal.token} position</p>
                </div>
              </div>

              <p className="text-sm text-secondary mb-6">
                The bot will close your position in the next cycle (~10 seconds).
                You'll receive USDC back to your vault balance.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal({ show: false, positionId: null, token: '', tokenAddress: '' })}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={requestClose}
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                >
                  Close Position
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bot Settings Modal */}
      {showSettingsModal && (
        <VaultSettingsModal
          currentRiskLevel={botSettings.riskLevelPercent}
          autoTradeEnabled={botSettings.autoTradeEnabled}
          currentTakeProfit={botSettings.takeProfit}
          currentStopLoss={botSettings.stopLoss}
          onClose={() => setShowSettingsModal(false)}
          onSuccess={() => {
            setShowSettingsModal(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
};

export default BotHistoryPage;
