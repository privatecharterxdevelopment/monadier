import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Package,
  Check,
  Zap,
  Crown,
  Rocket,
  Download,
  Calendar,
  CreditCard,
  Shield,
  Star,
  Bot,
  Monitor,
  Wallet,
  Loader2,
  ExternalLink,
  Copy,
  Apple,
  MonitorDown,
  BarChart3,
  Infinity,
  RefreshCw,
  Key,
  AlertCircle
} from 'lucide-react';
import { useSubscription, Subscription } from '../../contexts/SubscriptionContext';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAppKit } from '@reown/appkit/react';
import Card from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { generateLicenseCode, getUserTimezone, SUBSCRIPTION_PLANS } from '../../lib/subscription';

// Generate forex license key
function generateForexLicenseKey(userId: string, planType: 'monthly' | 'lifetime'): string {
  const prefix = planType === 'lifetime' ? 'FX-LT' : 'FX-MO';
  const userPart = userId.replace(/-/g, '').substring(0, 8).toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase().substring(0, 6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${userPart}-${timestamp}-${random}`;
}

// Payment receiving address (treasury)
const TREASURY_ADDRESS = '0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c';

const SubscriptionsPage: React.FC = () => {
  const {
    subscriptions,
    activeSubscription,
    addSubscription,
    cancelSubscription,
    getCreditLineByTier
  } = useSubscription();
  const {
    isConnected,
    address,
    tokenBalances,
    currentChain,
    approveToken,
    transferToken,
    refreshBalances
  } = useWeb3();
  const { open } = useAppKit();

  const [selectedTab, setSelectedTab] = useState<'trading' | 'software' | 'forex'>('trading');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'approving' | 'paying' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [generatedLicense, setGeneratedLicense] = useState<string | null>(null);
  const [desktopLicense, setDesktopLicense] = useState<{ code: string; createdAt: string } | null>(null);
  const [forexLicense, setForexLicense] = useState<{ code: string; planType: string; createdAt: string } | null>(null);
  const [copiedLicense, setCopiedLicense] = useState(false);

  // Fetch existing licenses on mount
  useEffect(() => {
    const fetchLicenses = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fetch desktop license
        const { data: desktopData } = await supabase
          .from('subscriptions')
          .select('license_code, created_at')
          .eq('user_id', user.id)
          .eq('plan_tier', 'desktop')
          .eq('status', 'active')
          .single();

        if (desktopData?.license_code) {
          setDesktopLicense({ code: desktopData.license_code, createdAt: desktopData.created_at });
        }

        // Fetch forex license
        const { data: forexData } = await supabase
          .from('forex_licenses')
          .select('license_key, plan_type, created_at')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (forexData?.license_key) {
          setForexLicense({
            code: forexData.license_key,
            planType: forexData.plan_type,
            createdAt: forexData.created_at
          });
        }
      }
    };
    fetchLicenses();
  }, []);

  // Get available stablecoin balance
  const stablecoinBalance = tokenBalances
    .filter(t => t.symbol === 'USDT' || t.symbol === 'USDC')
    .reduce((sum, t) => sum + parseFloat(t.balance), 0);

  // Get the best stablecoin to use for payment
  const bestStablecoin = tokenBalances
    .filter(t => t.symbol === 'USDT' || t.symbol === 'USDC')
    .sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance))[0];

  const tradingBotPlans = [
    {
      id: 'starter',
      name: 'Starter',
      monthlyPrice: SUBSCRIPTION_PLANS.starter.monthlyPrice,
      yearlyPrice: SUBSCRIPTION_PLANS.starter.yearlyPrice,
      price: billingCycle === 'monthly' ? SUBSCRIPTION_PLANS.starter.monthlyPrice : SUBSCRIPTION_PLANS.starter.yearlyPrice,
      billingCycle: billingCycle as 'monthly' | 'yearly',
      yearlyDiscount: SUBSCRIPTION_PLANS.starter.yearlyDiscount,
      icon: <Zap className="w-6 h-6" />,
      features: [
        '25 trades per day',
        'Base & Polygon chains',
        'Spot & DCA strategies',
        '3 connected wallets',
        'Email support'
      ],
      creditLine: 1000
    },
    {
      id: 'pro',
      name: 'Professional',
      monthlyPrice: SUBSCRIPTION_PLANS.pro.monthlyPrice,
      yearlyPrice: SUBSCRIPTION_PLANS.pro.yearlyPrice,
      price: billingCycle === 'monthly' ? SUBSCRIPTION_PLANS.pro.monthlyPrice : SUBSCRIPTION_PLANS.pro.yearlyPrice,
      billingCycle: billingCycle as 'monthly' | 'yearly',
      yearlyDiscount: SUBSCRIPTION_PLANS.pro.yearlyDiscount,
      icon: <Crown className="w-6 h-6" />,
      popular: true,
      features: [
        '100 trades per day',
        'All chains supported',
        'Grid & DCA strategies',
        '10 connected wallets',
        'Priority support',
        'Performance analytics'
      ],
      creditLine: 5000
    },
    {
      id: 'elite',
      name: 'Elite',
      monthlyPrice: SUBSCRIPTION_PLANS.elite.monthlyPrice,
      yearlyPrice: SUBSCRIPTION_PLANS.elite.yearlyPrice,
      price: billingCycle === 'monthly' ? SUBSCRIPTION_PLANS.elite.monthlyPrice : SUBSCRIPTION_PLANS.elite.yearlyPrice,
      billingCycle: billingCycle as 'monthly' | 'yearly',
      yearlyDiscount: SUBSCRIPTION_PLANS.elite.yearlyDiscount,
      icon: <Rocket className="w-6 h-6" />,
      features: [
        'Unlimited trades',
        'All chains supported',
        'All strategies + Arbitrage',
        'Unlimited wallets',
        '24/7 VIP support',
        'API access & Webhooks',
        'Custom strategies'
      ],
      creditLine: 15000
    }
  ];

  const softwarePlans = [
    {
      id: 'lifetime',
      name: 'Desktop License',
      price: 499,
      billingCycle: 'one_time' as const,
      icon: <Download className="w-6 h-6" />,
      features: [
        'One-time payment',
        'Run locally on your machine',
        'Offline trading capability',
        'Lifetime updates included',
        'All strategies unlocked',
        'Unlimited trades',
        'No subscription fees'
      ],
      creditLine: 25000,
      badge: 'Best Value'
    }
  ];

  const forexPlans = [
    {
      id: 'forex-monthly',
      name: 'MT5 Monthly',
      price: 29,
      billingCycle: 'monthly' as const,
      icon: <RefreshCw className="w-6 h-6" />,
      features: [
        'Full MT5 EA access',
        'All trading strategies',
        '5 trades per day limit',
        'Regular updates',
        'Email support'
      ],
      tradeLimit: 5
    },
    {
      id: 'forex-lifetime',
      name: 'MT5 Lifetime',
      price: 199,
      billingCycle: 'one_time' as const,
      icon: <Infinity className="w-6 h-6" />,
      features: [
        'Lifetime MT5 EA access',
        'All trading strategies',
        'Unlimited trades',
        'Free lifetime updates',
        'Priority support'
      ],
      tradeLimit: -1,
      badge: 'Best Value'
    }
  ];

  const handlePurchase = (plan: any, type: 'trading_bot' | 'software_license' | 'forex_license') => {
    setSelectedPlan({ ...plan, type });
    setPaymentStatus('idle');
    setTxHash(null);
    setShowPurchaseModal(true);
  };

  const confirmPurchase = async () => {
    if (!selectedPlan || !isConnected || !bestStablecoin) return;

    try {
      setIsPaying(true);
      setPaymentStatus('approving');

      // Get token decimals (USDC/USDT = 6, DAI = 18)
      const decimals = bestStablecoin.symbol === 'DAI' ? 18 : 6;

      // 1. Approve the token transfer
      await approveToken(
        bestStablecoin.address,
        TREASURY_ADDRESS,
        selectedPlan.price.toString()
      );

      setPaymentStatus('paying');

      // 2. Transfer tokens to treasury
      const hash = await transferToken(
        bestStablecoin.address,
        TREASURY_ADDRESS,
        selectedPlan.price.toString(),
        decimals
      );

      setTxHash(hash);
      setPaymentStatus('success');

      // Create pending payment record BEFORE transaction
      // Backend will verify the on-chain tx and activate subscription
      const { data: { user } } = await supabase.auth.getUser();
      if (user && address) {
        // Create pending payment - backend will complete it when USDC arrives
        await supabase.from('pending_payments').insert({
          user_id: user.id,
          wallet_address: address.toLowerCase(),
          plan_tier: selectedPlan.id,
          billing_cycle: selectedPlan.billingCycle === 'one_time' ? 'lifetime' : selectedPlan.billingCycle,
          expected_amount: selectedPlan.price,
          status: 'pending'
        });

        // Ensure user has a subscription record (will be updated by backend)
        await supabase.from('subscriptions').upsert({
          user_id: user.id,
          wallet_address: address.toLowerCase(),
          plan_tier: 'free', // Will be upgraded by backend after payment verified
          status: 'pending',
          daily_trades_used: 0,
          total_trades_used: 0,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
          timezone: getUserTimezone() // Store user's timezone for daily reset
        }, { onConflict: 'user_id' });
      }

      // Add to local state (optimistic update - backend will confirm)
      addSubscription({
        type: selectedPlan.type,
        tier: selectedPlan.id,
        name: selectedPlan.name,
        price: selectedPlan.price,
        billingCycle: selectedPlan.billingCycle,
        features: selectedPlan.features
      });

      // Refresh balances
      await refreshBalances();

    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus('error');
    } finally {
      setIsPaying(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: Subscription['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'expired':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'cancelled':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'starter':
        return <Zap className="w-5 h-5 text-blue-400" />;
      case 'pro':
        return <Crown className="w-5 h-5 text-white" />;
      case 'elite':
        return <Rocket className="w-5 h-5 text-amber-400" />;
      case 'lifetime':
        return <Download className="w-5 h-5 text-emerald-400" />;
      default:
        return <Package className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Subscriptions</h1>
          <p className="text-gray-400 text-sm mt-1">Manage your plans and licenses</p>
        </div>
      </div>

      {/* Note: My Plans moved to Profile page */}

      {/* Trading Bot Plans */}
      {selectedTab === 'trading' && (
        <div className="space-y-6">
          {/* Crypto DEX Header */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Bot className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  Crypto DEX Trading Bot
                  <span className="px-2 py-0.5 text-xs font-bold bg-orange-500/20 text-orange-400 rounded">CRYPTO</span>
                </h2>
                <p className="text-gray-400 text-sm">Automated trading on Uniswap, PancakeSwap & more DEXs</p>
              </div>
            </div>

            {/* Billing Cycle Toggle */}
            <div className="flex items-center gap-2 p-1 bg-zinc-800 rounded-xl">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-white text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  billingCycle === 'yearly'
                    ? 'bg-white text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Yearly
                <span className="px-1.5 py-0.5 text-xs bg-green-500 text-white rounded font-bold">-31%</span>
              </button>
            </div>
          </div>

          {/* Current Active Subscription */}
          {activeSubscription && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-accent/10 via-accent/5 to-transparent rounded-2xl border border-accent/30 p-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                    {activeSubscription.tier === 'elite' ? (
                      <Crown className="w-6 h-6 text-accent" />
                    ) : activeSubscription.tier === 'pro' ? (
                      <Rocket className="w-6 h-6 text-accent" />
                    ) : (
                      <Zap className="w-6 h-6 text-accent" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-white capitalize">{activeSubscription.tier} Plan</h3>
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">Active</span>
                    </div>
                    <p className="text-gray-400 text-sm">
                      {activeSubscription.billingCycle === 'lifetime'
                        ? 'Lifetime access - never expires'
                        : `Valid until ${new Date(activeSubscription.endDate).toLocaleDateString()} (manual renewal required)`
                      }
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-gray-500 text-xs mb-1">Daily Trades</p>
                  <p className="text-white font-mono">
                    {activeSubscription.dailyTradesUsed} / {activeSubscription.tier === 'elite' ? '∞' : activeSubscription.tier === 'pro' ? '20' : '5'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tradingBotPlans.map(plan => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4 }}
              className={`relative bg-[#141414] rounded-2xl border ${
                activeSubscription?.tier === plan.id
                  ? 'border-white/20'
                  : 'border-gray-800/50'
              } p-8 transition-all`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-white text-black text-xs font-medium rounded-full tracking-wide">
                  RECOMMENDED
                </div>
              )}

              {activeSubscription?.tier === plan.id && (
                <div className="absolute -top-3 right-4 px-3 py-1 bg-white/10 text-white text-xs font-medium rounded-full border border-white/20">
                  Active
                </div>
              )}

              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 mb-6">
                {plan.icon}
              </div>

              <h3 className="text-lg font-medium text-white mb-2 tracking-wide">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-light text-white">${plan.price}</span>
                <span className="text-gray-500 text-sm">/{billingCycle === 'yearly' ? 'year' : 'month'}</span>
              </div>
              {billingCycle === 'yearly' && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-gray-500 text-sm line-through">${plan.monthlyPrice * 12}/year</span>
                  <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
                    Save ${(plan.monthlyPrice * 12) - plan.yearlyPrice}
                  </span>
                </div>
              )}
              {billingCycle === 'monthly' && <div className="mb-4" />}

              <div className="h-px bg-gray-800/50 mb-6" />

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-gray-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-1.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePurchase(plan, 'trading_bot')}
                disabled={activeSubscription?.tier === plan.id}
                className={`w-full py-3.5 rounded-xl font-medium transition-all text-sm tracking-wide ${
                  activeSubscription?.tier === plan.id
                    ? 'bg-white/5 text-gray-600 cursor-not-allowed border border-gray-800'
                    : 'bg-white text-black hover:bg-gray-100'
                }`}
              >
                {activeSubscription?.tier === plan.id ? 'Current Plan' : 'Get Started'}
              </button>
            </motion.div>
          ))}
          </div>
        </div>
      )}

      {/* Software License */}
      {selectedTab === 'software' && (
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Show License & Downloads if already owned */}
          {desktopLicense && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#141414] rounded-2xl border border-white/20 p-8"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <Check className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">Desktop License Active</h3>
                  <p className="text-gray-500 text-sm">Lifetime access - never expires</p>
                </div>
              </div>

              <div className="bg-background rounded-xl p-5 mb-6">
                <p className="text-gray-400 text-xs mb-2">Your License Code</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/50 px-4 py-3 rounded-lg text-white font-mono text-sm tracking-wider break-all">
                    {desktopLicense.code}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(desktopLicense.code);
                      setCopiedLicense(true);
                      setTimeout(() => setCopiedLicense(false), 2000);
                    }}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {copiedLicense ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-gray-400" />}
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-white font-medium mb-3">Download Desktop App</p>
                <div className="grid grid-cols-2 gap-3">
                  <a
                    href="#"
                    className="flex items-center justify-center gap-3 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                  >
                    <Apple size={22} className="text-white/70" />
                    <div className="text-left">
                      <p className="text-white text-sm font-medium">macOS</p>
                      <p className="text-gray-500 text-xs">Intel & Apple Silicon</p>
                    </div>
                  </a>
                  <a
                    href="#"
                    className="flex items-center justify-center gap-3 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                  >
                    <MonitorDown size={22} className="text-white/70" />
                    <div className="text-left">
                      <p className="text-white text-sm font-medium">Windows</p>
                      <p className="text-gray-500 text-xs">Windows 10/11</p>
                    </div>
                  </a>
                </div>
              </div>

              <p className="text-gray-500 text-xs">
                Activated on {new Date(desktopLicense.createdAt).toLocaleDateString()}
              </p>
            </motion.div>
          )}

          {/* Purchase Section */}
          {softwarePlans.map(plan => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`relative bg-[#141414] rounded-2xl border ${desktopLicense ? 'border-gray-800/30 opacity-60' : 'border-gray-800/50'} p-10`}
            >
              {!desktopLicense && (
                <div className="absolute -top-3 left-8 px-4 py-1 bg-white text-black text-xs font-medium rounded-full tracking-wide">
                  {plan.badge?.toUpperCase()}
                </div>
              )}

              <div className="flex items-start gap-6 mb-8">
                <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70">
                  {plan.icon}
                </div>
                <div>
                  <h3 className="text-2xl font-medium text-white mb-1 tracking-wide">{plan.name}</h3>
                  <p className="text-gray-500">
                    Own the software forever with a single payment
                  </p>
                </div>
              </div>

              <div className="flex items-baseline gap-2 mb-8">
                <span className="text-5xl font-light text-white">${plan.price.toLocaleString()}</span>
                <span className="text-gray-500">one-time</span>
              </div>

              <div className="h-px bg-gray-800/50 mb-8" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-sm text-gray-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-1.5 flex-shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-8">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-4 h-4 text-white/60" />
                  <span className="text-white/80 font-medium text-sm">Why Desktop?</span>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Run the trading bot locally on your machine. Full privacy, no subscription fees,
                  and lifetime updates included.
                </p>
              </div>

              {desktopLicense || subscriptions.find(s => s.tier === 'lifetime' && s.status === 'active') ? (
                <button
                  disabled
                  className="w-full py-4 bg-white/5 text-gray-600 rounded-xl font-medium cursor-not-allowed border border-gray-800"
                >
                  Already Owned
                </button>
              ) : (
                <button
                  onClick={() => handlePurchase(plan, 'software_license')}
                  className="w-full py-4 bg-white text-black rounded-xl font-medium transition-colors hover:bg-gray-100 text-sm tracking-wide"
                >
                  Purchase License
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Forex MT5 Plans */}
      {selectedTab === 'forex' && (
        <div className="space-y-6">
          {/* Forex MT5 Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-gray-800">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                Forex MT5 Expert Advisor
                <span className="px-2 py-0.5 text-xs font-bold bg-blue-500/20 text-blue-400 rounded">FOREX</span>
              </h2>
              <p className="text-gray-400 text-sm">Automated trading on MetaTrader 5 for forex pairs</p>
            </div>
          </div>

          {/* Show existing forex license if owned */}
          {forexLicense && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#141414] rounded-2xl border border-blue-500/30 p-8"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <Check className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">MT5 License Active</h3>
                  <p className="text-gray-500 text-sm">
                    {forexLicense.planType === 'lifetime' ? 'Lifetime access' : 'Monthly subscription'}
                  </p>
                </div>
              </div>

              <div className="bg-background rounded-xl p-5 mb-6">
                <p className="text-gray-400 text-xs mb-2">Your MT5 License Key</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/50 px-4 py-3 rounded-lg text-white font-mono text-sm tracking-wider break-all">
                    {forexLicense.code}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(forexLicense.code);
                      setCopiedLicense(true);
                      setTimeout(() => setCopiedLicense(false), 2000);
                    }}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {copiedLicense ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-gray-400" />}
                  </button>
                </div>
                <p className="text-gray-500 text-xs mt-3">
                  Enter this key in your MT5 Expert Advisor to activate trading.
                </p>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Key className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-blue-400 font-medium mb-1">How to use your license</p>
                    <ol className="text-gray-400 text-sm space-y-1 list-decimal list-inside">
                      <li>Open MetaTrader 5</li>
                      <li>Add the Monadier EA to your chart</li>
                      <li>Enter your license key in the EA settings</li>
                      <li>Start automated trading</li>
                    </ol>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {forexPlans.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative bg-[#141414] rounded-2xl border p-8 ${
                  plan.badge ? 'border-blue-500/30' : 'border-gray-800/50'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-500 text-white text-xs font-medium rounded-full">
                    {plan.badge}
                  </div>
                )}

                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    plan.billingCycle === 'one_time' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                  }`}>
                    {plan.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                    <p className="text-gray-500 text-sm">
                      {plan.billingCycle === 'one_time' ? 'One-time payment' : 'Cancel anytime'}
                    </p>
                  </div>
                </div>

                <div className="mb-6">
                  <span className="text-5xl font-display font-medium text-white">${plan.price}</span>
                  {plan.billingCycle === 'monthly' && <span className="text-gray-500 ml-2">/month</span>}
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-gray-400">
                      <Check className={`w-5 h-5 flex-shrink-0 ${
                        plan.billingCycle === 'one_time' ? 'text-blue-400' : 'text-purple-400'
                      }`} />
                      {feature}
                    </li>
                  ))}
                  {plan.tradeLimit === 5 && (
                    <li className="flex items-center gap-3 text-yellow-400">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      5 trades per day limit
                    </li>
                  )}
                </ul>

                {forexLicense ? (
                  <button
                    disabled
                    className="w-full py-4 bg-white/5 text-gray-600 rounded-xl font-medium cursor-not-allowed border border-gray-800"
                  >
                    Already Owned
                  </button>
                ) : (
                  <button
                    onClick={() => handlePurchase(plan, 'forex_license')}
                    className={`w-full py-4 rounded-xl font-medium transition-colors ${
                      plan.billingCycle === 'one_time'
                        ? 'bg-blue-500 hover:bg-blue-600 text-white'
                        : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30'
                    }`}
                  >
                    {plan.billingCycle === 'one_time' ? 'Get Lifetime Access' : 'Start Monthly Plan'}
                  </button>
                )}
              </motion.div>
            ))}
          </div>

          {/* Trade Limit Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl mx-auto p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-400 font-medium mb-1">About Trade Limits</p>
                <p className="text-gray-400 text-sm">
                  Monthly plans are limited to 5 trades per day. Your license is validated on each trade.
                  Demo account trades don't count toward this limit. Upgrade to lifetime for unlimited trading.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Purchase Modal */}
      {showPurchaseModal && selectedPlan && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => !isPaying && setShowPurchaseModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card-dark rounded-2xl border border-gray-800 p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {paymentStatus === 'success' ? (
              <div className="text-center py-6">
                <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-green-400" />
                </div>
                <h2 className="text-2xl font-semibold text-white mb-2">Payment Successful!</h2>
                <p className="text-gray-400 mb-4">Your {selectedPlan.name} subscription is now active</p>

                {/* License Code Display */}
                {generatedLicense && (
                  <div className="bg-background rounded-xl p-5 mb-6 text-left">
                    <p className="text-gray-400 text-xs mb-2">
                      {selectedPlan.type === 'forex_license' ? 'Your MT5 License Key' : 'Your License Code'}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-black/50 px-4 py-3 rounded-lg text-white font-mono text-sm tracking-wider break-all">
                        {generatedLicense}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedLicense);
                          setCopiedLicense(true);
                          setTimeout(() => setCopiedLicense(false), 2000);
                        }}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        {copiedLicense ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-gray-400" />}
                      </button>
                    </div>
                    <p className="text-gray-500 text-xs mt-3">
                      {selectedPlan.type === 'forex_license'
                        ? 'Enter this key in your MT5 Expert Advisor settings to activate trading.'
                        : 'Save this code! You\'ll need it to activate the desktop app.'}
                    </p>
                  </div>
                )}

                {txHash && currentChain && (
                  <a
                    href={`${currentChain.blockExplorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-accent hover:text-accent-hover text-sm"
                  >
                    View Transaction <ExternalLink size={14} />
                  </a>
                )}

                {/* Download Links for Desktop (not for forex) */}
                {generatedLicense && selectedPlan.type !== 'forex_license' && (
                  <div className="mt-6 pt-6 border-t border-gray-800">
                    <p className="text-white font-medium mb-3">Download Desktop App</p>
                    <div className="flex gap-3">
                      <a
                        href="#"
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm text-gray-300"
                      >
                        <Apple size={18} />
                        macOS
                      </a>
                      <a
                        href="#"
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm text-gray-300"
                      >
                        <MonitorDown size={18} />
                        Windows
                      </a>
                    </div>
                    <p className="text-gray-500 text-xs mt-3">
                      Also available in your account settings
                    </p>
                  </div>
                )}

                <button
                  onClick={() => {
                    setShowPurchaseModal(false);
                    setSelectedPlan(null);
                    setGeneratedLicense(null);
                    setSelectedTab('current');
                  }}
                  className="mt-6 w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${selectedPlan.color} flex items-center justify-center text-white mx-auto mb-4`}>
                    {selectedPlan.icon}
                  </div>
                  <h2 className="text-2xl font-semibold text-white mb-2">
                    Pay with Crypto
                  </h2>
                  <p className="text-gray-400">
                    {selectedPlan.name} - ${selectedPlan.price} USDT/USDC
                    {selectedPlan.billingCycle !== 'one_time' && '/month'}
                  </p>
                </div>

                <div className="bg-background rounded-lg p-4 mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400">Plan</span>
                    <span className="text-white">{selectedPlan.name}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400">Network</span>
                    <span className="text-white">{currentChain?.name || 'Not connected'}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400">Pay with</span>
                    <span className="text-white">{bestStablecoin?.symbol || 'USDT/USDC'}</span>
                  </div>
                  <div className="border-t border-gray-800 pt-2 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium">Total</span>
                      <span className="text-white font-semibold">${selectedPlan.price}</span>
                    </div>
                  </div>
                </div>

                {!isConnected ? (
                  <button
                    onClick={() => open()}
                    className="w-full py-4 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-medium rounded-lg transition-colors mb-3 flex items-center justify-center gap-2"
                  >
                    <Wallet size={18} />
                    Connect Wallet to Pay
                  </button>
                ) : stablecoinBalance < selectedPlan.price ? (
                  <div className="space-y-3">
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                      <p className="text-red-400 text-sm">
                        Insufficient balance. You have ${stablecoinBalance.toFixed(2)} USDT/USDC
                      </p>
                      <p className="text-gray-500 text-xs mt-1">
                        Need ${selectedPlan.price} to complete purchase
                      </p>
                    </div>
                    <button
                      disabled
                      className="w-full py-4 bg-gray-700 text-gray-500 font-medium rounded-lg cursor-not-allowed"
                    >
                      Insufficient Balance
                    </button>
                  </div>
                ) : paymentStatus === 'error' ? (
                  <div className="space-y-3">
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                      <p className="text-red-400 text-sm">
                        Payment failed. Please try again.
                      </p>
                    </div>
                    <button
                      onClick={confirmPurchase}
                      className="w-full py-4 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
                    >
                      Retry Payment
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={confirmPurchase}
                    disabled={isPaying}
                    className="w-full py-4 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors mb-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPaying ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {paymentStatus === 'approving' ? 'Approving...' : 'Processing Payment...'}
                      </>
                    ) : (
                      <>
                        <Wallet size={18} />
                        Pay ${selectedPlan.price} with {bestStablecoin?.symbol}
                      </>
                    )}
                  </button>
                )}

                {!isPaying && (
                  <button
                    onClick={() => setShowPurchaseModal(false)}
                    className="w-full py-3 text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                )}

                {isConnected && (
                  <p className="text-gray-500 text-xs text-center mt-4">
                    Your wallet: {address?.slice(0, 6)}...{address?.slice(-4)}
                  </p>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default SubscriptionsPage;
