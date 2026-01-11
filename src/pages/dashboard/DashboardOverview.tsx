import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightIcon, BadgeCheck, Shield, Bot, History, AlertCircle, Package, Wallet, RefreshCw, CreditCard, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWeb3 } from '../../contexts/Web3Context';
import { useSubscription } from '../../contexts/SubscriptionContext';
import Card from '../../components/ui/Card';
import { Link } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import { supabase } from '../../lib/supabase';
import { VaultBalanceCard } from '../../components/vault';

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  plan_tier: string;
  billing_cycle: string;
  stripe_payment_id: string;
  created_at: string;
}

const DashboardOverview: React.FC = () => {
  const { profile } = useAuth();
  const {
    isConnected,
    address,
    currentChain,
    nativeBalance,
    tokenBalances,
    totalUsdValue,
    isLoadingBalances,
    refreshBalances
  } = useWeb3();
  const { kycStatus, activeSubscription, verifyKYC, planTier, isSubscribed, dailyTradesRemaining } = useSubscription();
  const { open } = useAppKit();

  // Get membership display name based on subscription tier
  const getMembershipName = () => {
    if (!planTier || planTier === 'free') return 'Free';
    return planTier.charAt(0).toUpperCase() + planTier.slice(1);
  };

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  // Fetch payment history
  useEffect(() => {
    const fetchPayments = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('payments')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5);

          if (!error && data) {
            setPayments(data);
          }
        }
      } catch (err) {
        console.error('Error fetching payments:', err);
      } finally {
        setLoadingPayments(false);
      }
    };
    fetchPayments();
  }, []);

  // Calculate stablecoin balance
  const stablecoinBalance = tokenBalances
    .filter(t => t.symbol === 'USDT' || t.symbol === 'USDC')
    .reduce((sum, t) => sum + parseFloat(t.balance), 0);

  // Format address for display
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const containerAnimation = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemAnimation = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <motion.div
      variants={containerAnimation}
      initial="hidden"
      animate="show"
    >
      {/* Wallet Balance Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <motion.div variants={itemAnimation} className="md:col-span-2">
          <Card className="p-6 h-full">
            {isConnected ? (
              <>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-gray-500 text-sm">Wallet Balance</p>
                      {currentChain && (
                        <span className="px-2 py-0.5 bg-white/10 text-white text-xs rounded-full">
                          {currentChain.shortName}
                        </span>
                      )}
                      <button
                        onClick={refreshBalances}
                        disabled={isLoadingBalances}
                        className="p-1 text-gray-500 hover:text-white transition-colors"
                      >
                        <RefreshCw size={14} className={isLoadingBalances ? 'animate-spin' : ''} />
                      </button>
                    </div>
                    <h2 className="text-4xl font-light text-white tracking-tight">
                      ${formatCurrency(totalUsdValue)}
                    </h2>
                    {address && (
                      <p className="text-gray-500 text-sm mt-1 font-mono">
                        {formatAddress(address)}
                      </p>
                    )}
                  </div>
                  <Link
                    to="/dashboard/trading-bot"
                    className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <Bot size={18} />
                    Trade Now
                  </Link>
                </div>

                {/* Token Balances Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-background rounded-lg p-4">
                    <p className="text-gray-500 text-xs mb-1">{currentChain?.nativeCurrency.symbol || 'Native'}</p>
                    <p className="text-xl font-light text-white">
                      {parseFloat(nativeBalance).toFixed(4)}
                    </p>
                  </div>
                  {tokenBalances.slice(0, 3).map((token) => (
                    <div key={token.symbol} className="bg-background rounded-lg p-4">
                      <p className="text-gray-500 text-xs mb-1">{token.symbol}</p>
                      <p className="text-xl font-light text-white">
                        {parseFloat(token.balance).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <Wallet size={32} className="text-white/60" />
                </div>
                <h3 className="text-xl font-medium text-white mb-2">Connect Your Wallet</h3>
                <p className="text-gray-500 text-sm text-center mb-4 max-w-sm">
                  Connect your wallet to view balances and start trading on decentralized exchanges
                </p>
                <button
                  onClick={() => open()}
                  className="px-6 py-3 bg-white hover:bg-gray-100 text-gray-900 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Wallet size={18} />
                  Connect Wallet
                </button>
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div variants={itemAnimation}>
          <Card className="p-6 h-full">
            <div className="flex space-x-4 items-start">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                <BadgeCheck size={24} className="text-white" />
              </div>
              <div>
                <h3 className="font-display text-xl mb-1">
                  {getMembershipName()} Member
                </h3>
                <p className="text-gray-500 text-sm mb-4">
                  {planTier === 'elite' || planTier === 'desktop'
                    ? 'Unlimited trades & all features'
                    : planTier === 'pro'
                      ? '100 trades/day & auto-trading'
                      : planTier === 'starter'
                        ? '25 trades/day & real trading'
                        : '5 paper trades/day'}
                </p>

                <Link to="/dashboard/subscriptions" className="flex items-center text-white text-sm hover:text-white-hover">
                  <span>{isSubscribed ? 'Manage plan' : 'Upgrade now'}</span>
                  <ArrowRightIcon size={14} className="ml-1" />
                </Link>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-800">
              {/* KYC Status */}
              <div className="flex space-x-4 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  kycStatus === 'verified' ? 'bg-green-500/10' : 'bg-yellow-500/10'
                }`}>
                  {kycStatus === 'verified' ? (
                    <Shield size={16} className="text-green-400" />
                  ) : (
                    <AlertCircle size={16} className="text-yellow-400" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-sm text-white">
                    {kycStatus === 'verified' ? 'KYC Verified' : 'KYC Pending'}
                  </h4>
                  <p className="text-gray-500 text-xs">
                    {kycStatus === 'verified' ? 'Identity confirmed' : 'Verification required'}
                  </p>
                </div>
                {kycStatus !== 'verified' && (
                  <button
                    onClick={verifyKYC}
                    className="px-3 py-1 bg-white/10 text-white text-xs rounded-lg hover:bg-white/15 transition-colors"
                  >
                    Verify
                  </button>
                )}
              </div>

              {/* Active Subscription */}
              <div className="flex space-x-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isSubscribed ? 'bg-green-500/10' : 'bg-gray-500/10'
                }`}>
                  <Package size={16} className={isSubscribed ? 'text-green-400' : 'text-gray-500'} />
                </div>
                <div>
                  <h4 className="font-medium text-sm text-white">Subscription</h4>
                  <p className="text-gray-500 text-xs">
                    {isSubscribed && planTier
                      ? `${getMembershipName()} - Active`
                      : planTier === 'free'
                        ? 'Free tier (paper trading)'
                        : 'No active plan'}
                  </p>
                </div>
              </div>

              {/* Daily Trades Remaining */}
              {planTier && (
                <div className="flex space-x-4 mt-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5">
                    <Bot size={16} className="text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-white">Daily Trades</h4>
                    <p className="text-gray-500 text-xs">
                      {dailyTradesRemaining === -1
                        ? 'Unlimited'
                        : `${dailyTradesRemaining} remaining today`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Bot Wallet (Vault) - For Paid Users */}
      <motion.div variants={itemAnimation} className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <VaultBalanceCard compact />
          </div>
          <div className="md:col-span-2">
            <Card className="p-6 h-full">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-5 h-5 text-white" />
                <h3 className="font-medium text-white">Auto-Trading Vault</h3>
              </div>
              <p className="text-gray-500 text-sm mb-4">
                Deposit USDC to the vault and let the bot trade automatically without signing each transaction.
                Configure your risk level (1-100%) and enable auto-trading to get started.
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-background rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-1">Base Fee</p>
                  <p className="text-white font-medium">1.0%</p>
                </div>
                <div className="bg-background rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-1">Other Chains</p>
                  <p className="text-white font-medium">3.5%</p>
                </div>
                <div className="bg-background rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-1">Max Risk</p>
                  <p className="text-white font-medium">100%</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </motion.div>

      {/* Supported Chains */}
      <motion.div variants={itemAnimation} className="mb-6">
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-white" />
              <h3 className="font-medium text-white">Supported Networks</h3>
            </div>
            <Link to="/dashboard/bot-history" className="text-sm text-white hover:text-white-hover">
              Trading History
            </Link>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { name: 'Ethereum', symbol: 'ETH', dex: 'Uniswap V3' },
                { name: 'BNB Chain', symbol: 'BSC', dex: 'PancakeSwap' },
                { name: 'Arbitrum', symbol: 'ARB', dex: 'Uniswap V3' },
                { name: 'Base', symbol: 'BASE', dex: 'Uniswap V3' },
                { name: 'Polygon', symbol: 'MATIC', dex: 'Uniswap V3' }
              ].map((chain) => (
                <div
                  key={chain.symbol}
                  className="p-4 rounded-lg bg-white/5 border border-gray-800 hover:border-gray-600 transition-colors"
                >
                  <p className="font-medium text-white">{chain.name}</p>
                  <p className="text-gray-500 text-xs mt-1">{chain.dex}</p>
                </div>
              ))}
            </div>

            {!isConnected && (
              <div className="mt-6 p-4 bg-background rounded-lg text-center">
                <p className="text-gray-400 text-sm mb-3">
                  Connect your wallet to start trading on decentralized exchanges
                </p>
                <button
                  onClick={() => open()}
                  className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 rounded-lg font-medium transition-colors"
                >
                  Connect Wallet
                </button>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Payment History */}
      <motion.div variants={itemAnimation} className="mb-6">
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-white" />
              <h3 className="font-medium text-white">Payment History</h3>
            </div>
            <Link to="/dashboard/subscriptions" className="text-sm text-gray-400 hover:text-white">
              View All
            </Link>
          </div>

          <div className="p-6">
            {loadingPayments ? (
              <div className="text-center py-8">
                <RefreshCw className="w-6 h-6 text-gray-500 animate-spin mx-auto" />
              </div>
            ) : payments.length > 0 ? (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-4 bg-background rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        payment.status === 'succeeded' ? 'bg-green-500/10' : 'bg-yellow-500/10'
                      }`}>
                        <CreditCard size={18} className={
                          payment.status === 'succeeded' ? 'text-green-400' : 'text-yellow-400'
                        } />
                      </div>
                      <div>
                        <p className="text-white font-medium">
                          {payment.plan_tier.charAt(0).toUpperCase() + payment.plan_tier.slice(1)} Plan
                        </p>
                        <p className="text-gray-500 text-sm">
                          {new Date(payment.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-medium">
                        ${(payment.amount / 100).toFixed(2)} {payment.currency.toUpperCase()}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        payment.status === 'succeeded'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {payment.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 mb-1">No payments yet</p>
                <p className="text-gray-500 text-sm">Your payment history will appear here</p>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div variants={itemAnimation}>
          <Card className="p-6">
            <h3 className="text-gray-500 font-medium text-sm mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Link
                to="/dashboard/trading-bot"
                className="flex items-center justify-between p-3 bg-background rounded-lg hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                    <Bot size={16} className="text-white" />
                  </div>
                  <span className="text-white">Trading Bot</span>
                </div>
                <ArrowRightIcon size={16} className="text-gray-500" />
              </Link>

              <Link
                to="/dashboard/subscriptions"
                className="flex items-center justify-between p-3 bg-background rounded-lg hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Package size={16} className="text-emerald-400" />
                  </div>
                  <span className="text-white">Subscriptions</span>
                </div>
                <ArrowRightIcon size={16} className="text-gray-500" />
              </Link>

              <Link
                to="/dashboard/bot-history"
                className="flex items-center justify-between p-3 bg-background rounded-lg hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                    <History size={16} className="text-white" />
                  </div>
                  <span className="text-white">Trading History</span>
                </div>
                <ArrowRightIcon size={16} className="text-gray-500" />
              </Link>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemAnimation}>
          <Card className="p-6">
            <h3 className="text-gray-500 font-medium text-sm mb-4">Wallet Info</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Network</span>
                <span className="text-white font-normal">
                  {currentChain?.name || 'Not Connected'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Available to Trade</span>
                <span className="text-white font-normal">${formatCurrency(stablecoinBalance)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">DEX</span>
                <span className="text-white font-normal">
                  {currentChain?.dex.name || 'N/A'}
                </span>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemAnimation}>
          <Card className="p-6">
            <h3 className="text-gray-500 font-medium text-sm mb-4">Wallet Status</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-500'}`}></div>
                <span className="text-gray-400 text-sm">
                  {isConnected ? 'Wallet Connected' : 'Wallet Disconnected'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${isSubscribed || planTier === 'free' ? 'bg-green-400' : 'bg-gray-500'}`}></div>
                <span className="text-gray-400 text-sm">
                  {isSubscribed ? `${getMembershipName()} Plan Active` : planTier === 'free' ? 'Free Plan (Paper Trading)' : 'Subscribe for Bot'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${stablecoinBalance > 0 ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
                <span className="text-gray-400 text-sm">
                  {stablecoinBalance > 0 ? 'Ready to Trade' : 'Fund Wallet to Trade'}
                </span>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default DashboardOverview;
