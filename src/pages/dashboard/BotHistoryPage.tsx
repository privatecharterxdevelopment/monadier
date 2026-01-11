import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, TrendingUp, TrendingDown, Users, Trophy, Zap, Crown, Rocket, ExternalLink, RefreshCw, Activity } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAccount } from 'wagmi';

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

// Token address to symbol mapping
const TOKEN_SYMBOLS: Record<string, string> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  '0x4200000000000000000000000000000000000006': 'WETH',
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 'DAI',
  '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': 'cbETH',
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': 'USDbC',
};

// Get token symbol from address or return shortened address
const getTokenSymbol = (addressOrSymbol: string): string => {
  if (!addressOrSymbol) return '???';

  // If it's already a symbol (no 0x prefix), return it
  if (!addressOrSymbol.startsWith('0x')) return addressOrSymbol;

  const lower = addressOrSymbol.toLowerCase();
  return TOKEN_SYMBOLS[lower] || `${addressOrSymbol.slice(0, 6)}...`;
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
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<'open' | 'closed' | 'legacy' | 'all'>('open');
  const [positions, setPositions] = useState<Position[]>([]);
  const [legacyTrades, setLegacyTrades] = useState<LegacyTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalProfit: 0,
    winRate: 0,
    totalTrades: 0,
    openPositions: 0
  });

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

  const fetchPositions = async () => {
    if (!address) return;

    setLoading(true);
    try {
      let query = supabase
        .from('positions')
        .select('*')
        .eq('wallet_address', address.toLowerCase())
        .order('created_at', { ascending: false });

      if (activeTab === 'open') {
        query = query.eq('status', 'open');
      } else if (activeTab === 'closed') {
        query = query.eq('status', 'closed');
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching positions:', error);
        return;
      }

      setPositions(data || []);

      // Calculate stats
      const allPositions = data || [];
      const closedPositions = allPositions.filter(p => p.status === 'closed');
      const totalProfit = closedPositions.reduce((sum, p) => sum + (p.profit_loss || 0), 0);
      const wins = closedPositions.filter(p => (p.profit_loss || 0) > 0).length;
      const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;

      setStats({
        totalProfit,
        winRate,
        totalTrades: closedPositions.length,
        openPositions: allPositions.filter(p => p.status === 'open').length
      });
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();

    // Refresh every 10 seconds
    const interval = setInterval(fetchPositions, 10000);
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

  const getCurrentProfit = (position: Position) => {
    if (position.status === 'closed') {
      return position.profit_loss || 0;
    }
    // For open positions, estimate based on highest price
    const currentValue = position.token_amount * position.highest_price;
    return currentValue - position.entry_amount;
  };

  const getProfitPercent = (position: Position) => {
    if (position.status === 'closed') {
      return position.profit_loss_percent || 0;
    }
    const profit = getCurrentProfit(position);
    return (profit / position.entry_amount) * 100;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bot Trading History</h1>
          <p className="text-secondary mt-1">View your positions and profits</p>
        </div>
        <button
          onClick={fetchPositions}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
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
              <p className="text-sm text-secondary">Total P/L</p>
              <p className={`text-xl font-bold ${stats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.totalProfit >= 0 ? '+' : ''}${stats.totalProfit.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-secondary">Win Rate</p>
              <p className="text-xl font-bold text-white">{stats.winRate.toFixed(1)}%</p>
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
          Closed
        </button>
        <button
          onClick={() => setActiveTab('legacy')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
            activeTab === 'legacy'
              ? 'bg-white text-gray-900'
              : 'text-secondary hover:text-white'
          }`}
        >
          <Zap size={18} />
          Previous ({legacyTrades.length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
            activeTab === 'all'
              ? 'bg-white text-gray-900'
              : 'text-secondary hover:text-white'
          }`}
        >
          All
        </button>
      </div>

      {/* Positions Table */}
      <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-8 gap-4 px-4 py-3 bg-background border-b border-gray-800 text-sm font-medium text-secondary">
          <div>Token</div>
          <div>Direction</div>
          <div>Entry</div>
          <div>Size</div>
          <div>TP / SL</div>
          <div>P/L</div>
          <div>Status</div>
          <div>Date</div>
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
            <div className="py-12 text-center">
              <History className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-secondary">No {activeTab} positions</p>
              <p className="text-sm text-gray-600 mt-1">
                {activeTab === 'open' ? 'The bot will open positions when signals are detected' : 'Completed trades will appear here'}
              </p>
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
                    className="grid grid-cols-8 gap-4 px-4 py-3 border-b border-gray-800 hover:bg-surface-hover transition-colors items-center"
                  >
                    {/* Token */}
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{position.token_symbol}</span>
                    </div>

                    {/* Direction */}
                    <div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        position.direction === 'LONG'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {position.direction}
                      </span>
                    </div>

                    {/* Entry Price */}
                    <div className="text-white font-mono text-sm">
                      ${position.entry_price.toFixed(2)}
                    </div>

                    {/* Size */}
                    <div className="text-white font-mono text-sm">
                      ${position.entry_amount.toFixed(2)}
                    </div>

                    {/* TP / SL */}
                    <div className="text-xs">
                      <div className="text-green-400">
                        TP: {position.take_profit_percent}%
                      </div>
                      <div className={position.stop_activated ? 'text-amber-400' : 'text-gray-500'}>
                        SL: {position.trailing_stop_percent}% {position.stop_activated ? '(active)' : ''}
                      </div>
                    </div>

                    {/* P/L */}
                    <div className={`flex items-center gap-1 font-mono text-sm ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                      {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      <div>
                        <div>{isProfit ? '+' : ''}${profit.toFixed(2)}</div>
                        <div className="text-xs opacity-75">
                          ({isProfit ? '+' : ''}{profitPercent.toFixed(1)}%)
                        </div>
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
                        <div className="text-xs text-gray-500 mt-1">
                          {position.close_reason}
                        </div>
                      )}
                    </div>

                    {/* Date */}
                    <div className="text-secondary text-sm">
                      {formatDate(position.created_at)}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};

export default BotHistoryPage;
