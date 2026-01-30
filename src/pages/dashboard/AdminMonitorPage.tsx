import React, { useState, useEffect, useCallback } from 'react';
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
  Clock,
  DollarSign,
  Shield,
  ExternalLink,
  CreditCard,
  Lock,
  Mail,
  Coins,
  BarChart3,
  Zap
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatUnits, createPublicClient, http } from 'viem';
import { arbitrum } from 'viem/chains';
import { VAULT_ADDRESS, VAULT_V8_ABI } from '../../lib/vault';
import { useWeb3 } from '../../contexts/Web3Context';

// Admin email - only this user can access
const ADMIN_EMAIL = 'ipsunlorem@gmail.com';

// V11 Vault - Arbitrum Only (reconcile fix + fees direct to treasury)
const V11_VAULT = VAULT_ADDRESS;
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const TREASURY_ADDRESS = '0x64d79e57640A8d4A56Ad1d08c932B5CCF0B263a9';

// Create Arbitrum public client for on-chain reads
const arbitrumClient = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc')
});

// Emergency rescue ABI (V11 contract)
const EMERGENCY_ABI = [
  {
    inputs: [],
    name: 'initiateEmergencyRescue',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'cancelEmergencyRescue',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'executeEmergencyRescue',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'emergencyRescueActive',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'emergencyRescueInitiated',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

const EMERGENCY_TIMELOCK = 60; // 60 seconds

interface SystemStats {
  // V11 Vault Stats
  vaultRealBalance: string;      // ACTUAL USDC in contract (truth)
  vaultTVL: string;              // Contract-tracked TVL (may differ)
  treasuryBalance: string;       // Fees sent directly to treasury
  isSolvent: boolean;
  surplus: string;
  // User Stats
  totalUsers: number;
  usersWithWallet: number;
  activeTraders: number;
  // Trade Stats
  openPositions: number;
  closedPositions: number;
  totalPnL: number;
  winRate: number;
  avgTradeSize: number;
  // Subscriptions
  totalSubscriptions: number;
  activeSubscriptions: number;
}

interface VaultTransaction {
  hash: string;
  type: 'deposit' | 'withdraw';
  amount: string;
  user: string;
  timestamp: string;
}

interface UserProfile {
  id: string;
  email: string;
  wallet_address: string | null;
  created_at: string;
  membership_tier: string | null;
}

interface Trade {
  id: string;
  wallet_address: string;
  chain_id: number;
  token_symbol: string;
  token_address: string;
  direction: string;
  status: string;
  entry_amount: number;
  entry_price: number | null;
  exit_price: number | null;
  profit_loss: number | null;
  profit_loss_percent: number | null;
  leverage_multiplier: number | null;
  created_at: string;
  closed_at: string | null;
  close_reason: string | null;
}

interface Subscription {
  id: string;
  user_id: string;
  wallet_address: string;
  plan_tier: string;
  status: string;
  end_date: string;
  start_date: string;
  billing_cycle: string;
}

interface Payment {
  id: string;
  user_id: string;
  wallet_address: string;
  plan_tier: string;
  billing_cycle: string;
  expected_amount: number;
  status: string;
  tx_hash: string | null;
  completed_at: string | null;
  created_at: string;
}

const AdminMonitorPage: React.FC = () => {
  const { walletClient, publicClient: web3PublicClient, address: connectedAddress } = useWeb3();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [vaultTransactions, setVaultTransactions] = useState<VaultTransaction[]>([]);
  const [activeSection, setActiveSection] = useState<'overview' | 'users' | 'subscriptions' | 'trades' | 'vault' | 'fees' | 'payments' | 'emergency'>('overview');
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [emergencyInitiatedAt, setEmergencyInitiatedAt] = useState(0);
  const [emergencyCountdown, setEmergencyCountdown] = useState(0);
  const [contractOwner, setContractOwner] = useState<string>('');
  const [emergencyLoading, setEmergencyLoading] = useState<string | null>(null);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);
  const [emergencySuccess, setEmergencySuccess] = useState<string | null>(null);
  const [stats, setStats] = useState<SystemStats>({
    vaultRealBalance: '0',
    vaultTVL: '0',
    treasuryBalance: '0',
    isSolvent: false,
    surplus: '0',
    totalUsers: 0,
    usersWithWallet: 0,
    activeTraders: 0,
    openPositions: 0,
    closedPositions: 0,
    totalPnL: 0,
    winRate: 0,
    avgTradeSize: 0,
    totalSubscriptions: 0,
    activeSubscriptions: 0
  });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Fetch V11 Vault Stats directly from chain
  const fetchVaultStats = async () => {
    let realBalance = 0n;
    let tvl = 0n;
    let treasuryBalance = 0n;
    let isSolvent = false;
    let surplus = 0n;

    // 1. Fetch treasury USDC balance via RPC (not Arbiscan API — avoids rate limits)
    try {
      treasuryBalance = await arbitrumClient.readContract({
        address: USDC_ARBITRUM as `0x${string}`,
        abi: [{
          inputs: [{ name: 'account', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function'
        }],
        functionName: 'balanceOf',
        args: [TREASURY_ADDRESS as `0x${string}`]
      }) as bigint;
    } catch (e) {
      console.error('[Admin] Failed to fetch treasury balance:', e);
    }

    // 2. Fetch vault health status - V11 returns 4 values (no accumulatedFees)
    try {
      const healthStatus = await arbitrumClient.readContract({
        address: V11_VAULT,
        abi: VAULT_V8_ABI,
        functionName: 'getHealthStatus'
      }) as [bigint, bigint, boolean, bigint];

      realBalance = healthStatus[0] || 0n;  // Actual USDC in contract
      tvl = healthStatus[1] || 0n;          // What contract thinks it owes
      isSolvent = healthStatus[2];
      surplus = healthStatus[3];
    } catch (err) {
      console.error('[Admin] Error fetching vault stats:', err);
    }

    return {
      realBalance: formatUnits(realBalance, 6),   // ACTUAL USDC on-chain
      tvl: formatUnits(tvl, 6),                    // Contract-tracked TVL
      treasuryBalance: formatUnits(treasuryBalance, 6),
      isSolvent,
      surplus: formatUnits(surplus, 6)
    };
  };

  // Fetch V11 Vault transactions from Arbiscan
  const fetchVaultTransactions = async () => {
    const transactions: VaultTransaction[] = [];

    try {
      const response = await fetch(
        `https://api.arbiscan.io/api?module=account&action=tokentx&contractaddress=${USDC_ARBITRUM}&address=${V11_VAULT}&sort=desc&page=1&offset=100`
      );
      const data = await response.json();

      if (data.status === '1' && Array.isArray(data.result)) {
        data.result.forEach((tx: any) => {
          const isDeposit = tx.to.toLowerCase() === V11_VAULT.toLowerCase();
          transactions.push({
            hash: tx.hash,
            type: isDeposit ? 'deposit' : 'withdraw',
            amount: formatUnits(BigInt(tx.value), 6),
            user: isDeposit ? tx.from : tx.to,
            timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString()
          });
        });
      }
    } catch (err) {
      console.error('Error fetching vault transactions:', err);
    }

    return transactions;
  };

  // Fetch all data
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch vault stats and transactions in parallel
      const [vaultStats, vaultTxs] = await Promise.all([
        fetchVaultStats(),
        fetchVaultTransactions()
      ]);

      setVaultTransactions(vaultTxs);

      // Fetch all Supabase data in parallel
      const [
        { data: profilesData },
        { data: positionsData },
        { data: subscriptionsData },
        { data: paymentsData }
      ] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('positions').select('*').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('*').order('start_date', { ascending: false }),
        supabase.from('pending_payments').select('*').order('created_at', { ascending: false })
      ]);

      const profiles = profilesData || [];
      const positions = positionsData || [];
      const subs = subscriptionsData || [];
      const pays = paymentsData || [];

      setUsers(profiles);
      setTrades(positions);
      setSubscriptions(subs);
      setPayments(pays);

      // Calculate stats
      const usersWithWallet = profiles.filter(p => p.wallet_address).length;
      const uniqueTraders = new Set(positions.map(p => p.wallet_address)).size;

      const openPositions = positions.filter(p => p.status === 'open' || p.status === 'closing');
      const closedPositions = positions.filter(p => p.status === 'closed');
      const totalPnL = closedPositions.reduce((sum, p) => sum + (p.profit_loss || 0), 0);
      const wins = closedPositions.filter(p => (p.profit_loss || 0) > 0).length;
      const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
      const avgTradeSize = positions.length > 0
        ? positions.reduce((sum, p) => sum + (p.entry_amount || 0), 0) / positions.length
        : 0;

      const activeSubs = subs.filter(s => s.status === 'active');

      setStats({
        vaultRealBalance: vaultStats.realBalance,
        vaultTVL: vaultStats.tvl,
        treasuryBalance: vaultStats.treasuryBalance,
        isSolvent: vaultStats.isSolvent,
        surplus: vaultStats.surplus,
        totalUsers: profiles.length,
        usersWithWallet,
        activeTraders: uniqueTraders,
        openPositions: openPositions.length,
        closedPositions: closedPositions.length,
        totalPnL,
        winRate,
        avgTradeSize,
        totalSubscriptions: subs.length,
        activeSubscriptions: activeSubs.length
      });

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching data:', err);
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

  // Fetch data when admin is confirmed
  useEffect(() => {
    if (isAdmin) {
      fetchAllData();
      const interval = setInterval(fetchAllData, 60000); // Refresh every minute
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  // Fetch emergency rescue status
  const fetchEmergencyStatus = useCallback(async () => {
    try {
      const [active, initiatedAt, owner] = await Promise.all([
        arbitrumClient.readContract({
          address: V11_VAULT,
          abi: EMERGENCY_ABI,
          functionName: 'emergencyRescueActive'
        }),
        arbitrumClient.readContract({
          address: V11_VAULT,
          abi: EMERGENCY_ABI,
          functionName: 'emergencyRescueInitiated'
        }),
        arbitrumClient.readContract({
          address: V11_VAULT,
          abi: EMERGENCY_ABI,
          functionName: 'owner'
        })
      ]);
      setEmergencyActive(active);
      setEmergencyInitiatedAt(Number(initiatedAt));
      setContractOwner(owner);
    } catch (err) {
      console.error('[Admin] Error fetching emergency status:', err);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchEmergencyStatus();
    }
  }, [isAdmin, fetchEmergencyStatus]);

  // Countdown timer for emergency rescue
  useEffect(() => {
    if (!emergencyActive || emergencyInitiatedAt === 0) {
      setEmergencyCountdown(0);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor(Date.now() / 1000) - emergencyInitiatedAt;
      const remaining = EMERGENCY_TIMELOCK - elapsed;
      setEmergencyCountdown(remaining > 0 ? remaining : 0);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [emergencyActive, emergencyInitiatedAt]);

  // Emergency rescue actions
  const handleInitiateRescue = async () => {
    if (!walletClient || !connectedAddress) {
      setEmergencyError('Connect your wallet first (must be contract owner)');
      return;
    }
    setEmergencyLoading('initiate');
    setEmergencyError(null);
    setEmergencySuccess(null);
    try {
      const hash = await walletClient.writeContract({
        address: V11_VAULT,
        abi: EMERGENCY_ABI,
        functionName: 'initiateEmergencyRescue',
        chain: arbitrum,
        account: connectedAddress as `0x${string}`
      });
      await arbitrumClient.waitForTransactionReceipt({ hash });
      setEmergencySuccess('Emergency rescue initiated. Contract paused. 60s countdown started.');
      await fetchEmergencyStatus();
    } catch (err: any) {
      setEmergencyError(err?.shortMessage || err?.message || 'Failed to initiate rescue');
    } finally {
      setEmergencyLoading(null);
    }
  };

  const handleCancelRescue = async () => {
    if (!walletClient || !connectedAddress) {
      setEmergencyError('Connect your wallet first');
      return;
    }
    setEmergencyLoading('cancel');
    setEmergencyError(null);
    setEmergencySuccess(null);
    try {
      const hash = await walletClient.writeContract({
        address: V11_VAULT,
        abi: EMERGENCY_ABI,
        functionName: 'cancelEmergencyRescue',
        chain: arbitrum,
        account: connectedAddress as `0x${string}`
      });
      await arbitrumClient.waitForTransactionReceipt({ hash });
      setEmergencySuccess('Emergency rescue cancelled. Contract unpaused.');
      await fetchEmergencyStatus();
    } catch (err: any) {
      setEmergencyError(err?.shortMessage || err?.message || 'Failed to cancel rescue');
    } finally {
      setEmergencyLoading(null);
    }
  };

  const handleExecuteRescue = async () => {
    if (!walletClient || !connectedAddress) {
      setEmergencyError('Connect your wallet first');
      return;
    }
    setEmergencyLoading('execute');
    setEmergencyError(null);
    setEmergencySuccess(null);
    try {
      const hash = await walletClient.writeContract({
        address: V11_VAULT,
        abi: EMERGENCY_ABI,
        functionName: 'executeEmergencyRescue',
        chain: arbitrum,
        account: connectedAddress as `0x${string}`
      });
      await arbitrumClient.waitForTransactionReceipt({ hash });
      setEmergencySuccess('Emergency rescue executed. All USDC sent to treasury.');
      await fetchEmergencyStatus();
      await fetchAllData();
    } catch (err: any) {
      setEmergencyError(err?.shortMessage || err?.message || 'Failed to execute rescue');
    } finally {
      setEmergencyLoading(null);
    }
  };

  const isContractOwner = connectedAddress && contractOwner &&
    connectedAddress.toLowerCase() === contractOwner.toLowerCase();

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
      case 'active': return 'text-green-400 bg-green-500/20';
      case 'expired': return 'text-red-400 bg-red-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case 'elite': return 'text-purple-400 bg-purple-500/20';
      case 'pro': return 'text-blue-400 bg-blue-500/20';
      case 'starter': return 'text-green-400 bg-green-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

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
        <p className="text-secondary">This page is restricted to administrators only.</p>
        {currentUserEmail && (
          <p className="text-xs text-gray-600 mt-2">Logged in as: {currentUserEmail}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard - V11 GMX</h1>
          <p className="text-secondary mt-1">
            Last updated: {lastRefresh.toLocaleTimeString()} • {currentUserEmail}
          </p>
        </div>
        <button
          onClick={fetchAllData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 p-1 bg-card-dark rounded-lg w-fit border border-gray-800 flex-wrap">
        {(['overview', 'users', 'trades', 'vault', 'fees', 'payments', 'subscriptions', 'emergency'] as const).map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
              activeSection === section
                ? section === 'emergency' ? 'bg-red-600 text-white' : 'bg-white text-black'
                : section === 'emergency' ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10' : 'text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            {section === 'overview' && <Activity size={16} />}
            {section === 'users' && <Users size={16} />}
            {section === 'trades' && <BarChart3 size={16} />}
            {section === 'vault' && <Wallet size={16} />}
            {section === 'fees' && <Coins size={16} />}
            {section === 'payments' && <DollarSign size={16} />}
            {section === 'subscriptions' && <CreditCard size={16} />}
            {section === 'emergency' && <Zap size={16} />}
            {section.charAt(0).toUpperCase() + section.slice(1)}
          </button>
        ))}
      </div>

      {/* ========== OVERVIEW SECTION ========== */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Main Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* V11 Vault Real Balance */}
            <div className="bg-card-dark rounded-xl border border-green-500/30 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Wallet className="text-green-400" size={20} />
                </div>
                <div>
                  <p className="text-sm text-secondary">Vault USDC (actual)</p>
                  <p className="text-xl font-bold text-white">
                    ${parseFloat(stats.vaultRealBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className={`text-xs ${stats.isSolvent ? 'text-green-400' : 'text-yellow-400'}`}>
                    {stats.isSolvent ? 'Healthy' : `GMX fees pending: $${Math.abs(parseFloat(stats.surplus)).toFixed(2)}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Treasury Balance (fees sent directly) */}
            <div className="bg-card-dark rounded-xl border border-green-500/30 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Coins className="text-green-400" size={20} />
                </div>
                <div>
                  <p className="text-sm text-secondary">Treasury Balance</p>
                  <p className="text-xl font-bold text-green-400">
                    ${parseFloat(stats.treasuryBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-secondary">
                    V11: All fees sent directly to treasury
                  </p>
                </div>
              </div>
            </div>

            {/* Total Users */}
            <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
                  <Users className="text-cyan-400" size={20} />
                </div>
                <div>
                  <p className="text-sm text-secondary">Total Users</p>
                  <p className="text-xl font-bold text-white">{stats.totalUsers}</p>
                  <p className="text-xs text-secondary">{stats.usersWithWallet} with wallet</p>
                </div>
              </div>
            </div>

            {/* Trading Stats */}
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
                  <p className="text-sm text-secondary">Total P/L</p>
                  <p className={`text-xl font-bold ${stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}
                  </p>
                  <p className="text-xs text-secondary">Win rate: {stats.winRate.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
              <h3 className="text-sm text-secondary mb-2">Positions</h3>
              <div className="flex justify-between">
                <div>
                  <p className="text-2xl font-bold text-blue-400">{stats.openPositions}</p>
                  <p className="text-xs text-secondary">Open</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-400">{stats.closedPositions}</p>
                  <p className="text-xs text-secondary">Closed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.activeTraders}</p>
                  <p className="text-xs text-secondary">Traders</p>
                </div>
              </div>
            </div>

            <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
              <h3 className="text-sm text-secondary mb-2">Subscriptions</h3>
              <div className="flex justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-400">{stats.activeSubscriptions}</p>
                  <p className="text-xs text-secondary">Active</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.totalSubscriptions}</p>
                  <p className="text-xs text-secondary">Total</p>
                </div>
              </div>
            </div>

            <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
              <h3 className="text-sm text-secondary mb-2">Avg Trade Size</h3>
              <p className="text-2xl font-bold text-white">${stats.avgTradeSize.toFixed(2)}</p>
            </div>
          </div>

          {/* V11 Vault Contract */}
          <div className="bg-card-dark rounded-xl border border-blue-500/30 p-4">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Shield size={20} className="text-blue-400" />
              V11 GMX Vault (Arbitrum)
            </h3>
            <div className="flex items-center justify-between">
              <code className="text-blue-400">{V11_VAULT}</code>
              <a
                href={`https://arbiscan.io/address/${V11_VAULT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
              >
                View on Arbiscan <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ========== USERS SECTION ========== */}
      {activeSection === 'users' && (
        <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Users size={20} className="text-cyan-400" />
              All Registered Users ({users.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr className="text-left text-sm text-secondary">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Wallet Address</th>
                  <th className="px-4 py-3">Tier</th>
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
                          href={`https://arbiscan.io/address/${user.wallet_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                        >
                          <code className="text-xs">{user.wallet_address}</code>
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-gray-500 italic">Not connected</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getTierColor(user.membership_tier || 'free')}`}>
                        {(user.membership_tier || 'FREE').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-secondary text-sm">
                      {new Date(user.created_at).toLocaleDateString()} {new Date(user.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-secondary">
                      No users registered yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== TRADES SECTION ========== */}
      {activeSection === 'trades' && (
        <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <BarChart3 size={20} className="text-purple-400" />
              All Trades ({trades.length})
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
                  <th className="px-4 py-3">Leverage</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Entry</th>
                  <th className="px-4 py-3">Exit</th>
                  <th className="px-4 py-3">P/L</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.id} className="border-t border-gray-800 hover:bg-white/5">
                    <td className="px-4 py-3 text-sm text-secondary whitespace-nowrap">
                      {formatTimeAgo(trade.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://arbiscan.io/address/${trade.wallet_address}`}
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
                      {trade.token_symbol || 'ETH'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        trade.direction === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {trade.direction || 'LONG'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white font-mono text-sm">
                      {trade.leverage_multiplier ? `${trade.leverage_multiplier}x` : '-'}
                    </td>
                    <td className="px-4 py-3 text-white font-mono text-sm">
                      ${(trade.entry_amount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-white font-mono text-sm">
                      {trade.entry_price ? `$${trade.entry_price.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-white font-mono text-sm">
                      {trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {trade.profit_loss !== null ? (
                        <div className="flex flex-col">
                          <span className={`font-mono text-sm ${
                            trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss.toFixed(2)}
                          </span>
                          {trade.profit_loss_percent !== null && (
                            <span className={`text-xs ${
                              trade.profit_loss_percent >= 0 ? 'text-green-400/70' : 'text-red-400/70'
                            }`}>
                              ({trade.profit_loss_percent >= 0 ? '+' : ''}{trade.profit_loss_percent.toFixed(2)}%)
                            </span>
                          )}
                        </div>
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
                {trades.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-secondary">
                      No trades yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== VAULT TRANSACTIONS SECTION ========== */}
      {activeSection === 'vault' && (
        <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <DollarSign size={20} className="text-green-400" />
              V11 Vault Transactions ({vaultTransactions.length})
            </h3>
            <p className="text-sm text-secondary mt-1">All deposits and withdrawals to V11 GMX Vault</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr className="text-left text-sm text-secondary">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {vaultTransactions.map((tx, idx) => (
                  <tr key={`${tx.hash}-${idx}`} className="border-t border-gray-800 hover:bg-white/5">
                    <td className="px-4 py-3 text-sm text-secondary whitespace-nowrap">
                      {formatTimeAgo(tx.timestamp)}
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
                        href={`https://arbiscan.io/address/${tx.user}`}
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
                        href={`https://arbiscan.io/tx/${tx.hash}`}
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
                    <td colSpan={5} className="px-4 py-8 text-center text-secondary">
                      No vault transactions yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== FEES SECTION ========== */}
      {activeSection === 'fees' && (
        <div className="space-y-6">
          <div className="bg-card-dark rounded-xl border border-green-500/30 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Coins size={20} className="text-green-400" />
              Platform Fees (All Time)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-secondary mb-1">Treasury Wallet Balance</p>
                <p className="text-4xl font-bold text-green-400">
                  ${parseFloat(stats.treasuryBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p className="text-sm text-secondary mt-2">
                  V11: All fees sent directly to treasury (no accumulation in contract)
                </p>
                <p className="text-xs text-secondary mt-1 break-all">
                  {TREASURY_ADDRESS}
                </p>
              </div>
              <div>
                <p className="text-sm text-secondary mb-1">Fee Structure</p>
                <p className="text-2xl font-bold text-white">
                  0.1% + 10%
                </p>
                <p className="text-sm text-secondary mt-2">
                  0.1% deposit fee (to bot wallet) + 0.1% base fee on position + 10% of profit (to treasury)
                </p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-gray-700">
              <p className="text-sm text-secondary mb-2">Fee Structure</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex justify-between p-2 bg-white/5 rounded">
                  <span className="text-secondary">Base Fee</span>
                  <span className="text-white">0.1% on position</span>
                </div>
                <div className="flex justify-between p-2 bg-white/5 rounded">
                  <span className="text-secondary">Success Fee</span>
                  <span className="text-green-400">10% of profit</span>
                </div>
              </div>
            </div>
          </div>

          {/* Profitable trades that generated fees */}
          <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Profitable Trades (Fee Source)</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background">
                  <tr className="text-left text-sm text-secondary">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Profit</th>
                    <th className="px-4 py-3">0.1% Position Fee</th>
                    <th className="px-4 py-3">10% Success Fee</th>
                    <th className="px-4 py-3">Total Fee</th>
                    <th className="px-4 py-3">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {trades
                    .filter(t => t.status === 'closed' && (t.profit_loss || 0) > 0)
                    .slice(0, 20)
                    .map((trade) => {
                      const lev = trade.leverage_multiplier || 1;
                      const positionSize = (trade.entry_amount || 0) * lev;
                      const platformFee = positionSize * 0.001; // 0.1%
                      const successFee = (trade.profit_loss || 0) * 0.1; // 10%
                      const totalFee = platformFee + successFee;
                      return (
                      <tr key={trade.id} className="border-t border-gray-800 hover:bg-white/5">
                        <td className="px-4 py-3">
                          <code className="text-xs text-blue-400">
                            {trade.wallet_address.slice(0, 6)}...{trade.wallet_address.slice(-4)}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-green-400 font-mono">
                          +${(trade.profit_loss || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-yellow-400 font-mono">
                          +${platformFee.toFixed(2)}
                          <span className="text-xs text-secondary ml-1">({lev}x)</span>
                        </td>
                        <td className="px-4 py-3 text-green-400 font-mono">
                          +${successFee.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-green-400 font-mono font-bold">
                          +${totalFee.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-secondary text-sm">
                          {trade.closed_at ? formatTimeAgo(trade.closed_at) : '-'}
                        </td>
                      </tr>);
                    ))}
                  {trades.filter(t => t.status === 'closed' && (t.profit_loss || 0) > 0).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-secondary">
                        No profitable trades yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========== PAYMENTS SECTION ========== */}
      {activeSection === 'payments' && (
        <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <DollarSign size={20} className="text-green-400" />
              Subscription Payments ({payments.length})
            </h3>
            <p className="text-sm text-secondary mt-1">All crypto payments for subscriptions</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr className="text-left text-sm text-secondary">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Wallet</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Billing</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-gray-800 hover:bg-white/5">
                    <td className="px-4 py-3 text-sm text-secondary whitespace-nowrap">
                      {formatTimeAgo(payment.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://arbiscan.io/address/${payment.wallet_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                      >
                        <code className="text-xs">{payment.wallet_address?.slice(0, 6)}...{payment.wallet_address?.slice(-4)}</code>
                        <ExternalLink size={10} />
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getTierColor(payment.plan_tier)}`}>
                        {payment.plan_tier.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white text-sm">
                      {payment.billing_cycle}
                    </td>
                    <td className="px-4 py-3 text-green-400 font-mono">
                      ${payment.expected_amount}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        payment.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        payment.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {payment.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {payment.tx_hash ? (
                        <a
                          href={`https://arbiscan.io/tx/${payment.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-gray-400 hover:text-white"
                        >
                          <code className="text-xs">{payment.tx_hash.slice(0, 10)}...</code>
                          <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-secondary">
                      No payments yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== EMERGENCY RESCUE SECTION ========== */}
      {activeSection === 'emergency' && (
        <div className="space-y-6">
          {/* Warning Banner */}
          <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="text-red-400 flex-shrink-0 mt-1" size={28} />
              <div>
                <h3 className="text-xl font-bold text-red-400">Emergency Rescue</h3>
                <p className="text-red-300/80 mt-2">
                  This will pause the contract and start a 60-second countdown. After the countdown,
                  all remaining USDC will be sent to the treasury wallet. Users can still call
                  emergencyWithdraw() during the countdown window.
                </p>
                <p className="text-red-400/60 text-sm mt-2">
                  Only use this in case of a hack or critical vulnerability.
                </p>
              </div>
            </div>
          </div>

          {/* Wallet Connection Status */}
          <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
            <h4 className="text-sm text-secondary mb-3">Wallet Status</h4>
            {connectedAddress ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-400" />
                  <span className="text-white text-sm">Connected: </span>
                  <code className="text-blue-400 text-xs">{connectedAddress}</code>
                </div>
                {contractOwner && (
                  <div className="flex items-center gap-2">
                    {isContractOwner ? (
                      <>
                        <CheckCircle size={16} className="text-green-400" />
                        <span className="text-green-400 text-sm">You are the contract owner</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={16} className="text-red-400" />
                        <span className="text-red-400 text-sm">
                          Not the contract owner. Owner: <code className="text-xs">{contractOwner.slice(0, 10)}...{contractOwner.slice(-6)}</code>
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <XCircle size={16} className="text-yellow-400" />
                <span className="text-yellow-400 text-sm">Wallet not connected. Connect the contract owner wallet to use emergency functions.</span>
              </div>
            )}
          </div>

          {/* Current Rescue Status */}
          <div className={`bg-card-dark rounded-xl border p-6 ${emergencyActive ? 'border-red-500/50' : 'border-gray-800'}`}>
            <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Shield size={20} className={emergencyActive ? 'text-red-400' : 'text-gray-400'} />
              Rescue Status
            </h4>

            {emergencyActive ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-red-400 font-bold text-lg">EMERGENCY RESCUE ACTIVE</span>
                </div>
                <div className="bg-red-900/20 rounded-lg p-4">
                  <p className="text-secondary text-sm">Contract is paused. Users can emergencyWithdraw().</p>
                  <p className="text-white text-2xl font-mono mt-2">
                    {emergencyCountdown > 0 ? (
                      <>Timelock: {emergencyCountdown}s remaining</>
                    ) : (
                      <span className="text-green-400">Ready to execute</span>
                    )}
                  </p>
                  {emergencyInitiatedAt > 0 && (
                    <p className="text-secondary text-xs mt-1">
                      Initiated: {new Date(emergencyInitiatedAt * 1000).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex gap-4 mt-4">
                  <button
                    onClick={handleCancelRescue}
                    disabled={emergencyLoading !== null || !isContractOwner}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
                  >
                    {emergencyLoading === 'cancel' ? <RefreshCw size={16} className="animate-spin" /> : <XCircle size={16} />}
                    Cancel Rescue
                  </button>

                  <button
                    onClick={handleExecuteRescue}
                    disabled={emergencyLoading !== null || emergencyCountdown > 0 || !isContractOwner}
                    className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
                  >
                    {emergencyLoading === 'execute' ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                    Execute Rescue (Send All to Treasury)
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-green-400">No emergency rescue active. Contract running normally.</span>
                </div>

                <button
                  onClick={handleInitiateRescue}
                  disabled={emergencyLoading !== null || !isContractOwner}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-white font-medium transition-colors mt-4"
                >
                  {emergencyLoading === 'initiate' ? <RefreshCw size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
                  Initiate Emergency Rescue
                </button>
              </div>
            )}

            {/* Status messages */}
            {emergencyError && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {emergencyError}
              </div>
            )}
            {emergencySuccess && (
              <div className="mt-4 p-3 bg-green-900/30 border border-green-500/30 rounded-lg text-green-400 text-sm">
                {emergencySuccess}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="bg-card-dark rounded-xl border border-gray-800 p-4">
            <h4 className="text-sm text-secondary mb-3">How Emergency Rescue Works</h4>
            <ol className="text-sm text-secondary space-y-2 list-decimal list-inside">
              <li><span className="text-white">Initiate</span> - Pauses the contract, starts 60s countdown</li>
              <li><span className="text-white">Wait</span> - Users can call emergencyWithdraw() to get their funds</li>
              <li><span className="text-white">Execute</span> - After 60s, sends all remaining USDC to treasury</li>
            </ol>
            <p className="text-xs text-gray-600 mt-3">
              Treasury: {TREASURY_ADDRESS}
            </p>
          </div>
        </div>
      )}

      {/* ========== SUBSCRIPTIONS SECTION ========== */}
      {activeSection === 'subscriptions' && (
        <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <CreditCard size={20} className="text-green-400" />
              All Subscriptions ({subscriptions.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr className="text-left text-sm text-secondary">
                  <th className="px-4 py-3">User ID</th>
                  <th className="px-4 py-3">Wallet</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Billing</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Expires</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="border-t border-gray-800 hover:bg-white/5">
                    <td className="px-4 py-3 text-white text-xs font-mono">
                      {sub.user_id.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3">
                      {sub.wallet_address ? (
                        <a
                          href={`https://arbiscan.io/address/${sub.wallet_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                        >
                          <code className="text-xs">{sub.wallet_address.slice(0, 10)}...{sub.wallet_address.slice(-6)}</code>
                          <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getTierColor(sub.plan_tier)}`}>
                        {sub.plan_tier.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white text-sm">
                      {sub.billing_cycle}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(sub.status)}`}>
                        {sub.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-secondary text-sm">
                      {new Date(sub.start_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-secondary text-sm">
                      {new Date(sub.end_date).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {subscriptions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-secondary">
                      No subscriptions yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMonitorPage;
