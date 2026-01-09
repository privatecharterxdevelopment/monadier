import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, TrendingUp, TrendingDown, Users, Trophy, Zap, Crown, Rocket } from 'lucide-react';

interface Trade {
  id: string;
  amount: number;
  pair: string;
  type: 'buy' | 'sell';
  profit: number;
  date: Date;
  walletAddress: string;
  tier: 'starter' | 'pro' | 'elite';
}

const tradingPairs = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT',
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD',
  'DOGE/USDT', 'AVAX/USDT', 'DOT/USDT', 'MATIC/USDT'
];

const generateWalletAddress = (): string => {
  const chars = '0123456789abcdef';
  let address = '0x';
  for (let i = 0; i < 8; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  address += '...';
  for (let i = 0; i < 4; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address;
};

const generateTrade = (): Trade => {
  const tiers: ('starter' | 'pro' | 'elite')[] = ['starter', 'pro', 'elite'];
  const tier = tiers[Math.floor(Math.random() * tiers.length)];

  let maxAmount = 1000;
  if (tier === 'pro') maxAmount = 10000;
  if (tier === 'elite') maxAmount = 50000;

  const amount = Math.floor(Math.random() * (maxAmount - 5) + 5);
  const profitPercent = (Math.random() - 0.3) * 20; // Slightly biased towards profit
  const profit = amount * (profitPercent / 100);

  return {
    id: Math.random().toString(36).substr(2, 9),
    amount,
    pair: tradingPairs[Math.floor(Math.random() * tradingPairs.length)],
    type: Math.random() > 0.5 ? 'buy' : 'sell',
    profit,
    date: new Date(),
    walletAddress: generateWalletAddress(),
    tier
  };
};

const BotHistoryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'my-trades' | 'top-performers'>('my-trades');
  const [topPerformerTrades, setTopPerformerTrades] = useState<Trade[]>([]);
  const [myTrades] = useState<Trade[]>([
    // Sample user trades
    {
      id: '1',
      amount: 500,
      pair: 'BTC/USDT',
      type: 'buy',
      profit: 23.50,
      date: new Date(Date.now() - 3600000),
      walletAddress: '0x1a2b3c4d...5e6f',
      tier: 'pro'
    },
    {
      id: '2',
      amount: 1200,
      pair: 'ETH/USDT',
      type: 'sell',
      profit: -15.30,
      date: new Date(Date.now() - 7200000),
      walletAddress: '0x1a2b3c4d...5e6f',
      tier: 'pro'
    },
    {
      id: '3',
      amount: 300,
      pair: 'EUR/USD',
      type: 'buy',
      profit: 8.75,
      date: new Date(Date.now() - 10800000),
      walletAddress: '0x1a2b3c4d...5e6f',
      tier: 'pro'
    }
  ]);

  // Load initial trades
  useEffect(() => {
    const initialTrades: Trade[] = [];
    for (let i = 0; i < 10; i++) {
      initialTrades.push({
        ...generateTrade(),
        date: new Date(Date.now() - Math.random() * 60000)
      });
    }
    setTopPerformerTrades(initialTrades);
  }, []);

  // Add new trades every 5-20 seconds
  useEffect(() => {
    if (activeTab !== 'top-performers') return;

    const addNewTrade = () => {
      const newTrade = generateTrade();
      setTopPerformerTrades(prev => [newTrade, ...prev.slice(0, 49)]);
    };

    const scheduleNextTrade = () => {
      const delay = Math.floor(Math.random() * 15000) + 5000; // 5-20 seconds
      return setTimeout(() => {
        addNewTrade();
        timeoutId = scheduleNextTrade();
      }, delay);
    };

    let timeoutId = scheduleNextTrade();

    return () => clearTimeout(timeoutId);
  }, [activeTab]);

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'starter': return <Zap className="w-4 h-4 text-blue-400" />;
      case 'pro': return <Crown className="w-4 h-4 text-purple-400" />;
      case 'elite': return <Rocket className="w-4 h-4 text-amber-400" />;
      default: return null;
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'starter': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'pro': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'elite': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return '';
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) {
      return 'Just now';
    } else if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const TradeRow: React.FC<{ trade: Trade; isNew?: boolean }> = ({ trade, isNew }) => (
    <motion.div
      initial={isNew ? { opacity: 0, x: -20, backgroundColor: 'rgba(139, 92, 246, 0.2)' } : { opacity: 1 }}
      animate={{ opacity: 1, x: 0, backgroundColor: 'transparent' }}
      transition={{ duration: 0.5 }}
      className="grid grid-cols-6 gap-4 px-4 py-3 border-b border-gray-800 hover:bg-surface-hover transition-colors items-center"
    >
      <div className="flex items-center gap-2">
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          trade.type === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {trade.type.toUpperCase()}
        </span>
        <span className="text-white font-medium">{trade.pair}</span>
      </div>

      <div className="text-white font-mono">
        ${trade.amount.toLocaleString()}
      </div>

      <div className={`flex items-center gap-1 font-mono ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {trade.profit >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
      </div>

      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium w-fit ${getTierColor(trade.tier)}`}>
        {getTierIcon(trade.tier)}
        <span className="capitalize">{trade.tier}</span>
      </div>

      <div className="text-secondary font-mono text-sm">
        {trade.walletAddress}
      </div>

      <div className="text-secondary text-sm">
        {formatDate(trade.date)}
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trading History</h1>
          <p className="text-secondary mt-1">View your trades and top performers</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 p-1 bg-card-dark rounded-lg w-fit border border-gray-800">
        <button
          onClick={() => setActiveTab('my-trades')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
            activeTab === 'my-trades'
              ? 'bg-accent text-white'
              : 'text-secondary hover:text-white'
          }`}
        >
          <History size={18} />
          My Trades
        </button>
        <button
          onClick={() => setActiveTab('top-performers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
            activeTab === 'top-performers'
              ? 'bg-accent text-white'
              : 'text-secondary hover:text-white'
          }`}
        >
          <Trophy size={18} />
          Top Performers
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </button>
      </div>

      {/* Trade Table */}
      <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-6 gap-4 px-4 py-3 bg-background border-b border-gray-800 text-sm font-medium text-secondary">
          <div>Trade</div>
          <div>Amount</div>
          <div>Profit/Loss</div>
          <div>Tier</div>
          <div>Wallet</div>
          <div>Date</div>
        </div>

        {/* Body */}
        <div className="max-h-[600px] overflow-y-auto">
          <AnimatePresence>
            {activeTab === 'my-trades' ? (
              myTrades.length > 0 ? (
                myTrades.map((trade) => (
                  <TradeRow key={trade.id} trade={trade} />
                ))
              ) : (
                <div className="py-12 text-center">
                  <History className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-secondary">No trades yet</p>
                  <p className="text-sm text-gray-600">Start the trading bot to see your trades here</p>
                </div>
              )
            ) : (
              topPerformerTrades.map((trade, index) => (
                <TradeRow key={trade.id} trade={trade} isNew={index === 0} />
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Stats Cards */}
      {activeTab === 'top-performers' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-secondary">Active Traders</p>
                <p className="text-xl font-bold text-white">2,847</p>
              </div>
            </div>
          </div>

          <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-secondary">Total Volume (24h)</p>
                <p className="text-xl font-bold text-white">$4.2M</p>
              </div>
            </div>
          </div>

          <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-secondary">Avg. Win Rate</p>
                <p className="text-xl font-bold text-white">67.3%</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BotHistoryPage;
