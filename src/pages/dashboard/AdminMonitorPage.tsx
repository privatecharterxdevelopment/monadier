import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Wallet,
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Zap,
  Clock,
  DollarSign,
  Cpu,
  Database,
  Shield,
  ExternalLink,
  CreditCard,
  Lock,
  UserCheck,
  Mail
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatUnits } from 'viem';

// Admin email - only this user can access
const ADMIN_EMAIL = 'ipsunlorem@gmail.com';

// Bot wallet address (from config)
const BOT_WALLET = '0xC9a6D02a04e3B2E8d3941615EfcBA67593F46b8E';
const TREASURY_WALLET = '0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c';

// Base Vaults
const V4_VAULT = '0x08Afb514255187d664d6b250D699Edc51491E803';
const V3_VAULT = '0xAd1F46B955b783c142ea9D2d3F221Ac2F3D63e79';
const V2_VAULT = '0x5eF29B4348d31c311918438e92a5fae7641Bc00a';

// Arbitrum V6 Vault (20x Leverage, On-chain SL/TP)
const V6_VAULT_ARBITRUM = '0xceD685CDbcF9056CdbD0F37fFE9Cd8152851D13A';

// USDC addresses
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

interface SystemStats {
  botBalance: string;
  botBalanceUsd: string;
  treasuryBalance: string;
  ethPrice: number;
  totalUsers: number;
  activeUsers: number;
  openPositions: number;
  closedToday: number;
  failedToday: number;
  totalPnL: number;
  winRate: number;
  avgTradeSize: number;
  lastTradeTime: string | null;
  gasUsedToday: string;
  estimatedTradesLeft: number;
  // Arbitrum V6 (20x Leverage)
  v5TvlArbitrum: string;
  v4TvlBase: string;
}

interface VaultTransaction {
  hash: string;
  type: 'deposit' | 'withdraw';
  amount: string;
  user: string;
  timestamp: string;
  chain: 'base' | 'arbitrum';
}

interface RecentTrade {
  id: string;
  wallet_address: string;
  token_symbol: string;
  direction: string;
  status: string;
  entry_amount: number;
  profit_loss: number | null;
  created_at: string;
  close_reason: string | null;
}

interface UserProfile {
  id: string;
  email: string;
  wallet_address: string | null;
  created_at: string;
  timezone: string | null;
}

interface Subscription {
  id: string;
  user_id: string;
  wallet_address: string;
  plan_tier: string;
  status: string;
  valid_until: string;
  created_at: string;
  profiles?: { email: string };
}

const AdminMonitorPage: React.FC = () => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [activeSection, setActiveSection] = useState<'overview' | 'users' | 'subscriptions' | 'trades' | 'vault'>('overview');
  const [stats, setStats] = useState<SystemStats>({
    botBalance: '0',
    botBalanceUsd: '0',
    treasuryBalance: '0',
    ethPrice: 0,
    totalUsers: 0,
    activeUsers: 0,
    openPositions: 0,
    closedToday: 0,
    failedToday: 0,
    totalPnL: 0,
    winRate: 0,
    avgTradeSize: 0,
    lastTradeTime: null,
    gasUsedToday: '0',
    estimatedTradesLeft: 0,
    v5TvlArbitrum: '0',
    v4TvlBase: '0'
  });
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [vaultTransactions, setVaultTransactions] = useState<VaultTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchBotBalance = async () => {
    try {
      // Fetch bot wallet ETH balance from Base
      const response = await fetch(`https://base.blockscout.com/api/v2/addresses/${BOT_WALLET}`);
      const data = await response.json();

      if (data.coin_balance) {
        const balanceWei = BigInt(data.coin_balance);
        const balanceEth = formatUnits(balanceWei, 18);
        return parseFloat(balanceEth);
      }
      return 0;
    } catch (err) {
      console.error('Error fetching bot balance:', err);
      return 0;
    }
  };

  const fetchTreasuryBalance = async () => {
    try {
      const response = await fetch(`https://base.blockscout.com/api/v2/addresses/${TREASURY_WALLET}`);
      const data = await response.json();

      if (data.coin_balance) {
        const balanceWei = BigInt(data.coin_balance);
        const balanceEth = formatUnits(balanceWei, 18);
        return parseFloat(balanceEth);
      }
      return 0;
    } catch (err) {
      console.error('Error fetching treasury balance:', err);
      return 0;
    }
  };

  const fetchEthPrice = async () => {
    try {
      const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT');
      const data = await response.json();
      return parseFloat(data.price);
    } catch {
      return 3300; // Fallback
    }
  };

  // Fetch V6 Arbitrum TVL (USDC balance of vault)
  const fetchV6ArbitrumTvl = async () => {
    try {
      const response = await fetch(`https://api.arbiscan.io/api?module=account&action=tokenbalance&contractaddress=${USDC_ARBITRUM}&address=${V6_VAULT_ARBITRUM}&tag=latest`);
      const data = await response.json();
      if (data.status === '1' && data.result) {
        return formatUnits(BigInt(data.result), 6);
      }
      return '0';
    } catch (err) {
      console.error('Error fetching V6 Arbitrum TVL:', err);
      return '0';
    }
  };

  // Fetch V4 Base TVL (USDC balance of vault)
  const fetchV4BaseTvl = async () => {
    try {
      const response = await fetch(`https://base.blockscout.com/api/v2/addresses/${V4_VAULT}/token-balances`);
      const data = await response.json();
      const usdcBalance = data.find((t: any) => t.token?.address?.toLowerCase() === USDC_BASE.toLowerCase());
      if (usdcBalance) {
        return formatUnits(BigInt(usdcBalance.value), 6);
      }
      return '0';
    } catch (err) {
      console.error('Error fetching V4 Base TVL:', err);
      return '0';
    }
  };

  // Fetch vault transactions from both chains
  const fetchVaultTransactions = async () => {
    const transactions: VaultTransaction[] = [];

    try {
      // Fetch Arbitrum V6 transactions
      const arbResponse = await fetch(`https://api.arbiscan.io/api?module=account&action=tokentx&contractaddress=${USDC_ARBITRUM}&address=${V6_VAULT_ARBITRUM}&sort=desc`);
      const arbData = await arbResponse.json();
      if (arbData.status === '1' && arbData.result) {
        arbData.result.slice(0, 50).forEach((tx: any) => {
          const isDeposit = tx.to.toLowerCase() === V6_VAULT_ARBITRUM.toLowerCase();
          transactions.push({
            hash: tx.hash,
            type: isDeposit ? 'deposit' : 'withdraw',
            amount: formatUnits(BigInt(tx.value), 6),
            user: isDeposit ? tx.from : tx.to,
            timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
            chain: 'arbitrum'
          });
        });
      }
    } catch (err) {
      console.error('Error fetching Arbitrum transactions:', err);
    }

    try {
      // Fetch Base V4 transactions
      const baseResponse = await fetch(`https://base.blockscout.com/api/v2/addresses/${V4_VAULT}/token-transfers?type=ERC-20`);
      const baseData = await baseResponse.json();
      if (baseData.items) {
        baseData.items.slice(0, 50).forEach((tx: any) => {
          if (tx.token?.address?.toLowerCase() === USDC_BASE.toLowerCase()) {
            const isDeposit = tx.to?.hash?.toLowerCase() === V4_VAULT.toLowerCase();
            transactions.push({
              hash: tx.transaction_hash,
              type: isDeposit ? 'deposit' : 'withdraw',
              amount: formatUnits(BigInt(tx.total?.value || '0'), 6),
              user: isDeposit ? tx.from?.hash : tx.to?.hash,
              timestamp: tx.timestamp,
              chain: 'base'
            });
          }
        });
      }
    } catch (err) {
      console.error('Error fetching Base transactions:', err);
    }

    // Sort by timestamp descending
    transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return transactions;
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Fetch balances, prices, and TVLs in parallel
      const [botBalance, treasuryBalance, ethPrice, v5Tvl, v4Tvl, vaultTxs] = await Promise.all([
        fetchBotBalance(),
        fetchTreasuryBalance(),
        fetchEthPrice(),
        fetchV6ArbitrumTvl(),
        fetchV4BaseTvl(),
        fetchVaultTransactions()
      ]);

      setVaultTransactions(vaultTxs);

      // Fetch position stats from Supabase
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      const [
        { data: allPositions },
        { data: openPositions },
        { data: closedToday },
        { data: failedToday },
        { data: uniqueUsers },
        { data: recentTradesData }
      ] = await Promise.all([
        supabase.from('positions').select('*'),
        supabase.from('positions').select('*').in('status', ['open', 'closing']),
        supabase.from('positions').select('*').eq('status', 'closed').gte('closed_at', todayStr),
        supabase.from('positions').select('*').eq('status', 'failed').gte('updated_at', todayStr),
        supabase.from('positions').select('wallet_address').limit(1000),
        supabase.from('positions').select('*').order('created_at', { ascending: false })
      ]);

      // Calculate stats
      const positions = allPositions || [];
      const closedPositions = positions.filter(p => p.status === 'closed');
      const totalPnL = closedPositions.reduce((sum, p) => sum + (p.profit_loss || 0), 0);
      const wins = closedPositions.filter(p => (p.profit_loss || 0) > 0).length;
      const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
      const avgTradeSize = positions.length > 0
        ? positions.reduce((sum, p) => sum + (p.entry_amount || 0), 0) / positions.length
        : 0;

      // Unique users
      const uniqueWallets = new Set(uniqueUsers?.map(u => u.wallet_address) || []);

      // Last trade time
      const lastTrade = positions.length > 0
        ? positions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        : null;

      // Estimate gas: ~0.0001 ETH per trade on Base
      const gasPerTrade = 0.0001;
      const estimatedTradesLeft = Math.floor(botBalance / gasPerTrade);

      setStats({
        botBalance: botBalance.toFixed(6),
        botBalanceUsd: (botBalance * ethPrice).toFixed(2),
        treasuryBalance: treasuryBalance.toFixed(6),
        ethPrice,
        totalUsers: uniqueWallets.size,
        activeUsers: (openPositions || []).length > 0 ? new Set((openPositions || []).map(p => p.wallet_address)).size : 0,
        openPositions: (openPositions || []).length,
        closedToday: (closedToday || []).length,
        failedToday: (failedToday || []).length,
        totalPnL,
        winRate,
        avgTradeSize,
        lastTradeTime: lastTrade?.created_at || null,
        gasUsedToday: ((closedToday || []).length * gasPerTrade).toFixed(6),
        estimatedTradesLeft,
        v5TvlArbitrum: v5Tvl,
        v4TvlBase: v4Tvl
      });

      setRecentTrades(recentTradesData || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setCurrentUserEmail(user.email);
        setIsAdmin(user.email === ADMIN_EMAIL);
      } else {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, []);

  // Fetch users and subscriptions
  const fetchUsersAndSubscriptions = async () => {
    try {
      const [{ data: profilesData }, { data: subsData }] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('*, profiles(email)').order('created_at', { ascending: false })
      ]);

      setUsers(profilesData || []);
      setSubscriptions(subsData || []);
    } catch (err) {
      console.error('Error fetching users/subscriptions:', err);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchStats();
      fetchUsersAndSubscriptions();
      const interval = setInterval(fetchStats, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'text-blue-400 bg-blue-500/20';
      case 'closed': return 'text-green-400 bg-green-500/20';
      case 'closing': return 'text-amber-400 bg-amber-500/20';
      case 'failed': return 'text-red-400 bg-red-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  const isLowGas = parseFloat(stats.botBalance) < 0.001;
  const isCriticalGas = parseFloat(stats.botBalance) < 0.0005;

  // Loading state
  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-gray-600 animate-spin" />
      </div>
    );
  }

  // Access denied
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Lock className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-secondary">
          This page is restricted to administrators only.
        </p>
        {currentUserEmail && (
          <p className="text-xs text-gray-600 mt-2">
            Logged in as: {currentUserEmail}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-secondary mt-1">
            Last updated: {lastRefresh.toLocaleTimeString()} • {currentUserEmail}
          </p>
        </div>
        <button
          onClick={() => { fetchStats(); fetchUsersAndSubscriptions(); }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 p-1 bg-card-dark rounded-lg w-fit border border-gray-800">
        {(['overview', 'vault', 'users', 'subscriptions', 'trades'] as const).map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
              activeSection === section
                ? 'bg-white text-black'
                : 'text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            {section === 'overview' && <Activity size={16} />}
            {section === 'vault' && <Wallet size={16} />}
            {section === 'users' && <Users size={16} />}
            {section === 'subscriptions' && <CreditCard size={16} />}
            {section === 'trades' && <Clock size={16} />}
            {section.charAt(0).toUpperCase() + section.slice(1)}
          </button>
        ))}
      </div>

      {/* VAULT SECTION */}
      {activeSection === 'vault' && (
        <div className="space-y-6">
          {/* TVL Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card-dark rounded-xl border border-blue-500/30 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Wallet className="text-blue-400" size={20} />
                </div>
                <div>
                  <p className="text-sm text-secondary">Arbitrum V6 TVL</p>
                  <p className="text-2xl font-bold text-white">${parseFloat(stats.v5TvlArbitrum).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
              <a
                href={`https://arbiscan.io/address/${V6_VAULT_ARBITRUM}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <code>{V6_VAULT_ARBITRUM}</code>
                <ExternalLink size={12} />
              </a>
            </div>

            <div className="bg-card-dark rounded-xl border border-purple-500/30 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Wallet className="text-purple-400" size={20} />
                </div>
                <div>
                  <p className="text-sm text-secondary">Base V4 TVL</p>
                  <p className="text-2xl font-bold text-white">${parseFloat(stats.v4TvlBase).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
              <a
                href={`https://basescan.org/address/${V4_VAULT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                <code>{V4_VAULT}</code>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {/* Vault Transactions */}
          <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <DollarSign size={20} className="text-green-400" />
                Vault Transactions ({vaultTransactions.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background">
                  <tr className="text-left text-sm text-secondary">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Chain</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Tx Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {vaultTransactions.map((tx, idx) => (
                    <tr key={`${tx.hash}-${idx}`} className="border-t border-gray-800 hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-secondary">
                        {formatTimeAgo(tx.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          tx.chain === 'arbitrum' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {tx.chain.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          tx.type === 'deposit' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {tx.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white font-mono">
                        ${parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={tx.chain === 'arbitrum' ? `https://arbiscan.io/address/${tx.user}` : `https://basescan.org/address/${tx.user}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                        >
                          <code className="text-xs">{tx.user?.slice(0, 6)}...{tx.user?.slice(-4)}</code>
                          <ExternalLink size={10} />
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={tx.chain === 'arbitrum' ? `https://arbiscan.io/tx/${tx.hash}` : `https://basescan.org/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-gray-400 hover:text-white"
                        >
                          <code className="text-xs">{tx.hash?.slice(0, 10)}...</code>
                          <ExternalLink size={10} />
                        </a>
                      </td>
                    </tr>
                  ))}
                  {vaultTransactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-secondary">
                        No vault transactions yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* USERS SECTION */}
      {activeSection === 'users' && (
        <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Users size={20} className="text-cyan-400" />
              All Users ({users.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr className="text-left text-sm text-secondary">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Wallet Address</th>
                  <th className="px-4 py-3">Timezone</th>
                  <th className="px-4 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-gray-800 hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Mail size={14} className="text-gray-500" />
                        <span className="text-white">{user.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.wallet_address ? (
                        <a
                          href={`https://basescan.org/address/${user.wallet_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                        >
                          <code className="text-xs">{user.wallet_address}</code>
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-gray-500">Not connected</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-secondary text-sm">
                      {user.timezone || 'Not set'}
                    </td>
                    <td className="px-4 py-3 text-secondary text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-secondary">
                      No users yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBSCRIPTIONS SECTION */}
      {activeSection === 'subscriptions' && (
        <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <CreditCard size={20} className="text-green-400" />
              All Subscriptions ({subscriptions.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr className="text-left text-sm text-secondary">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Wallet</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Valid Until</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="border-t border-gray-800 hover:bg-white/5">
                    <td className="px-4 py-3 text-white">
                      {sub.profiles?.email || sub.user_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://basescan.org/address/${sub.wallet_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                      >
                        <code className="text-xs">{sub.wallet_address.slice(0, 10)}...{sub.wallet_address.slice(-6)}</code>
                        <ExternalLink size={12} />
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        sub.plan_tier === 'elite' ? 'bg-purple-500/20 text-purple-400' :
                        sub.plan_tier === 'pro' ? 'bg-blue-500/20 text-blue-400' :
                        sub.plan_tier === 'starter' ? 'bg-green-500/20 text-green-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {sub.plan_tier.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        sub.status === 'active' ? 'bg-green-500/20 text-green-400' :
                        sub.status === 'expired' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {sub.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-secondary text-sm">
                      {new Date(sub.valid_until).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-secondary text-sm">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {subscriptions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-secondary">
                      No subscriptions yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRADES SECTION - Expanded Recent Trades */}
      {activeSection === 'trades' && (
        <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock size={20} className="text-gray-400" />
              All Trades ({recentTrades.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr className="text-left text-sm text-secondary">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">User Wallet</th>
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">P/L</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((trade) => (
                  <tr key={trade.id} className="border-t border-gray-800 hover:bg-white/5">
                    <td className="px-4 py-3 text-sm text-secondary">
                      {formatTimeAgo(trade.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://basescan.org/address/${trade.wallet_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                      >
                        <code className="text-xs">
                          {trade.wallet_address.slice(0, 6)}...{trade.wallet_address.slice(-4)}
                        </code>
                        <ExternalLink size={10} />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      {trade.token_symbol || 'WETH'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        trade.direction === 'LONG'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {trade.direction || 'LONG'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white font-mono text-sm">
                      ${(trade.entry_amount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      {trade.profit_loss !== null ? (
                        <span className={`font-mono text-sm ${
                          trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(trade.status)}`}>
                        {trade.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-32 truncate">
                      {trade.close_reason || '-'}
                    </td>
                  </tr>
                ))}
                {recentTrades.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-secondary">
                      No trades yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OVERVIEW SECTION */}
      {activeSection === 'overview' && (
        <>
      {/* Gas Warning Banner */}
      {isLowGas && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            isCriticalGas
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-amber-500/10 border-amber-500/30'
          }`}
        >
          <AlertTriangle className={isCriticalGas ? 'text-red-400' : 'text-amber-400'} size={24} />
          <div>
            <p className={`font-semibold ${isCriticalGas ? 'text-red-400' : 'text-amber-400'}`}>
              {isCriticalGas ? 'CRITICAL: Bot wallet nearly empty!' : 'Low gas warning'}
            </p>
            <p className="text-sm text-secondary">
              Bot wallet has {stats.botBalance} ETH (~{stats.estimatedTradesLeft} trades left).
              Send ETH to <code className="text-white">{BOT_WALLET}</code>
            </p>
          </div>
        </motion.div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Bot Wallet */}
        <div className={`bg-card-dark rounded-xl border p-4 ${
          isCriticalGas ? 'border-red-500' : isLowGas ? 'border-amber-500' : 'border-gray-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isCriticalGas ? 'bg-red-500/20' : isLowGas ? 'bg-amber-500/20' : 'bg-blue-500/10'
            }`}>
              <Wallet className={isCriticalGas ? 'text-red-400' : isLowGas ? 'text-amber-400' : 'text-blue-400'} size={20} />
            </div>
            <div className="flex-1">
              <p className="text-sm text-secondary">Bot Wallet</p>
              <p className="text-xl font-bold text-white">{stats.botBalance} ETH</p>
              <p className="text-xs text-secondary">${stats.botBalanceUsd} USD</p>
            </div>
            <a
              href={`https://basescan.org/address/${BOT_WALLET}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-white"
            >
              <ExternalLink size={16} />
            </a>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="flex justify-between text-xs">
              <span className="text-secondary">Est. trades left</span>
              <span className={isCriticalGas ? 'text-red-400' : isLowGas ? 'text-amber-400' : 'text-green-400'}>
                ~{stats.estimatedTradesLeft}
              </span>
            </div>
          </div>
        </div>

        {/* Open Positions */}
        <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Activity className="text-purple-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-secondary">Open Positions</p>
              <p className="text-xl font-bold text-white">{stats.openPositions}</p>
              <p className="text-xs text-secondary">{stats.activeUsers} active users</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-secondary">Closed today</span>
              <span className="text-green-400 ml-2">{stats.closedToday}</span>
            </div>
            <div>
              <span className="text-secondary">Failed today</span>
              <span className="text-red-400 ml-2">{stats.failedToday}</span>
            </div>
          </div>
        </div>

        {/* Total P/L */}
        <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              stats.totalPnL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
            }`}>
              {stats.totalPnL >= 0 ? (
                <TrendingUp className="text-green-400" size={20} />
              ) : (
                <TrendingDown className="text-red-400" size={20} />
              )}
            </div>
            <div>
              <p className="text-sm text-secondary">Total P/L (All Time)</p>
              <p className={`text-xl font-bold ${stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}
              </p>
              <p className="text-xs text-secondary">Win rate: {stats.winRate.toFixed(1)}%</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="flex justify-between text-xs">
              <span className="text-secondary">Avg trade size</span>
              <span className="text-white">${stats.avgTradeSize.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Users */}
        <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
              <Users className="text-cyan-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-secondary">Total Users</p>
              <p className="text-xl font-bold text-white">{stats.totalUsers}</p>
              <p className="text-xs text-secondary">ETH: ${stats.ethPrice.toFixed(0)}</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="flex justify-between text-xs">
              <span className="text-secondary">Last trade</span>
              <span className="text-white">
                {stats.lastTradeTime ? formatTimeAgo(stats.lastTradeTime) : 'Never'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contract Addresses */}
      <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield size={20} className="text-green-400" />
          Contract Addresses
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div>
              <p className="text-xs text-blue-400">V6 Vault Arbitrum (Active)</p>
              <code className="text-sm text-blue-400">{V6_VAULT_ARBITRUM}</code>
            </div>
            <a
              href={`https://arbiscan.io/address/${V6_VAULT_ARBITRUM}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-white"
            >
              <ExternalLink size={16} />
            </a>
          </div>
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
            <div>
              <p className="text-xs text-secondary">V4 Vault Base</p>
              <code className="text-sm text-purple-400">{V4_VAULT}</code>
            </div>
            <a
              href={`https://basescan.org/address/${V4_VAULT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-white"
            >
              <ExternalLink size={16} />
            </a>
          </div>
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
            <div>
              <p className="text-xs text-secondary">Bot Wallet</p>
              <code className="text-sm text-green-400">{BOT_WALLET}</code>
            </div>
            <a
              href={`https://basescan.org/address/${BOT_WALLET}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-white"
            >
              <ExternalLink size={16} />
            </a>
          </div>
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
            <div>
              <p className="text-xs text-secondary">Treasury</p>
              <code className="text-sm text-amber-400">{TREASURY_WALLET}</code>
            </div>
            <a
              href={`https://basescan.org/address/${TREASURY_WALLET}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-white"
            >
              <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </div>

      {/* System Health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3 mb-3">
            <Cpu size={20} className="text-purple-400" />
            <span className="font-semibold text-white">Bot Service</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Trading Interval</span>
              <span className="text-white">10s</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Monitor Interval</span>
              <span className="text-white">10s</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Reconciliation</span>
              <span className="text-white">5 min</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Circuit Breaker</span>
              <span className="text-green-400">2 failures</span>
            </div>
          </div>
        </div>

        <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3 mb-3">
            <Database size={20} className="text-blue-400" />
            <span className="font-semibold text-white">Analysis</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Candle Interval</span>
              <span className="text-white">1 hour</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Strategy</span>
              <span className="text-amber-400">Risky</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Max Positions</span>
              <span className="text-white">1 per token</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Tokens</span>
              <span className="text-white">WETH, cbETH</span>
            </div>
          </div>
        </div>

        <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3 mb-3">
            <Shield size={20} className="text-green-400" />
            <span className="font-semibold text-white">Security (V4)</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-secondary">User Withdraw</span>
              <CheckCircle size={16} className="text-green-400" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">User Emergency Close</span>
              <CheckCircle size={16} className="text-green-400" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Owner Access Funds</span>
              <XCircle size={16} className="text-red-400" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Owner Withdraw Fees</span>
              <CheckCircle size={16} className="text-green-400" />
            </div>
          </div>
        </div>
      </div>

        </>
      )}
    </div>
  );
};

export default AdminMonitorPage;
