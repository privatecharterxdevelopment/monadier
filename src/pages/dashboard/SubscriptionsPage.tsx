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
  MonitorDown
} from 'lucide-react';
import { useSubscription, Subscription } from '../../contexts/SubscriptionContext';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAppKit } from '@reown/appkit/react';
import Card from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { generateLicenseCode } from '../../lib/subscription';

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

  const [selectedTab, setSelectedTab] = useState<'current' | 'trading' | 'software'>('current');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'approving' | 'paying' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [generatedLicense, setGeneratedLicense] = useState<string | null>(null);
  const [desktopLicense, setDesktopLicense] = useState<{ code: string; createdAt: string } | null>(null);
  const [copiedLicense, setCopiedLicense] = useState(false);

  // Fetch existing desktop license on mount
  useEffect(() => {
    const fetchDesktopLicense = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('subscriptions')
          .select('license_code, created_at')
          .eq('user_id', user.id)
          .eq('plan_tier', 'desktop')
          .eq('status', 'active')
          .single();

        if (data?.license_code) {
          setDesktopLicense({ code: data.license_code, createdAt: data.created_at });
        }
      }
    };
    fetchDesktopLicense();
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
      price: 99,
      billingCycle: 'monthly' as const,
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
      price: 79,
      billingCycle: 'monthly' as const,
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
      price: 199,
      billingCycle: 'monthly' as const,
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

  const handlePurchase = (plan: any, type: 'trading_bot' | 'software_license') => {
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

      // Add subscription to local state
      addSubscription({
        type: selectedPlan.type,
        tier: selectedPlan.id,
        name: selectedPlan.name,
        price: selectedPlan.price,
        billingCycle: selectedPlan.billingCycle,
        features: selectedPlan.features
      });

      // Save subscription to Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const endDate = new Date();
        if (selectedPlan.billingCycle === 'monthly') {
          endDate.setMonth(endDate.getMonth() + 1);
        } else if (selectedPlan.billingCycle === 'yearly') {
          endDate.setFullYear(endDate.getFullYear() + 1);
        } else {
          endDate.setFullYear(endDate.getFullYear() + 100); // lifetime
        }

        // Generate license code for desktop purchases
        let licenseCode: string | null = null;
        if (selectedPlan.id === 'lifetime' || selectedPlan.type === 'software_license') {
          licenseCode = generateLicenseCode('desktop', 'lifetime');
          setGeneratedLicense(licenseCode);
          setDesktopLicense({ code: licenseCode, createdAt: new Date().toISOString() });
        }

        // Upsert subscription record
        await supabase.from('subscriptions').upsert({
          user_id: user.id,
          wallet_address: address,
          plan_tier: selectedPlan.id === 'lifetime' ? 'desktop' : selectedPlan.id,
          billing_cycle: selectedPlan.billingCycle === 'one_time' ? 'lifetime' : selectedPlan.billingCycle,
          status: 'active',
          start_date: new Date().toISOString(),
          end_date: endDate.toISOString(),
          auto_renew: selectedPlan.billingCycle !== 'lifetime' && selectedPlan.billingCycle !== 'one_time',
          daily_trades_used: 0,
          license_code: licenseCode,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        // Also insert into licenses table for desktop licenses
        if (licenseCode) {
          await supabase.from('licenses').insert({
            code: licenseCode,
            plan_tier: 'desktop',
            billing_cycle: 'lifetime',
            is_active: true,
            activated_at: new Date().toISOString(),
            activated_by: user.id
          });
        }

        // Record the payment
        await supabase.from('payments').insert({
          user_id: user.id,
          amount: Math.round(selectedPlan.price * 100), // cents
          currency: bestStablecoin.symbol.toLowerCase(),
          status: 'succeeded',
          plan_tier: selectedPlan.id === 'lifetime' ? 'desktop' : selectedPlan.id,
          billing_cycle: selectedPlan.billingCycle === 'one_time' ? 'lifetime' : selectedPlan.billingCycle,
          stripe_payment_id: hash // tx hash as payment reference
        });
      }

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

      {/* Tabs */}
      <div className="flex gap-2 bg-card-dark p-1 rounded-lg w-fit">
        {[
          { id: 'current', label: 'Current Plans', icon: Package },
          { id: 'trading', label: 'Trading Bot', icon: Bot },
          { id: 'software', label: 'Software License', icon: Monitor }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSelectedTab(tab.id as typeof selectedTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedTab === tab.id
                ? 'bg-white text-gray-900'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Current Subscriptions */}
      {selectedTab === 'current' && (
        <div className="space-y-4">
          {subscriptions.filter(s => s.status === 'active').length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subscriptions
                .filter(s => s.status === 'active')
                .map(subscription => (
                  <motion.div
                    key={subscription.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            subscription.tier === 'lifetime' ? 'bg-emerald-500/10' :
                            subscription.tier === 'elite' ? 'bg-amber-500/10' :
                            subscription.tier === 'pro' ? 'bg-white/5' :
                            'bg-blue-500/10'
                          }`}>
                            {getTierIcon(subscription.tier)}
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white">{subscription.name}</h3>
                            <p className="text-gray-400 text-sm">
                              {subscription.type === 'trading_bot' ? 'Trading Bot' : 'Software License'}
                            </p>
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs border ${getStatusColor(subscription.status)}`}>
                          {subscription.status}
                        </span>
                      </div>

                      <div className="space-y-3 mb-4">
                        <div className="flex items-center gap-2 text-sm">
                          <CreditCard className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-400">
                            ${subscription.price}
                            {subscription.billingCycle !== 'one_time' && `/${subscription.billingCycle === 'monthly' ? 'mo' : 'yr'}`}
                            {subscription.billingCycle === 'one_time' && ' (Lifetime)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-400">
                            Started {formatDate(subscription.startDate)}
                          </span>
                        </div>
                        {subscription.endDate && (
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-400">
                              Renews {formatDate(subscription.endDate)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm">
                          <Shield className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-400">
                            Credit Line: ${getCreditLineByTier(subscription.tier).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-gray-800">
                        <p className="text-gray-400 text-xs mb-2">Features</p>
                        <div className="flex flex-wrap gap-1">
                          {subscription.features.slice(0, 3).map((feature, i) => (
                            <span key={i} className="px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded">
                              {feature}
                            </span>
                          ))}
                          {subscription.features.length > 3 && (
                            <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded">
                              +{subscription.features.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>

                      {subscription.billingCycle !== 'one_time' && (
                        <button
                          onClick={() => cancelSubscription(subscription.id)}
                          className="mt-4 w-full py-2 text-red-400 text-sm hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          Cancel Subscription
                        </button>
                      )}
                    </Card>
                  </motion.div>
                ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Active Subscriptions</h3>
              <p className="text-gray-400 mb-6">Choose a plan to get started with trading</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setSelectedTab('trading')}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
                >
                  View Trading Plans
                </button>
                <button
                  onClick={() => setSelectedTab('software')}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  View Software License
                </button>
              </div>
            </Card>
          )}

          {/* Subscription History */}
          {subscriptions.filter(s => s.status !== 'active').length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-medium text-white mb-4">History</h3>
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-gray-400 text-xs border-b border-gray-800 bg-card-dark">
                    <tr>
                      <th className="text-left px-4 py-3">Plan</th>
                      <th className="text-left px-4 py-3">Type</th>
                      <th className="text-right px-4 py-3">Price</th>
                      <th className="text-center px-4 py-3">Status</th>
                      <th className="text-right px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions
                      .filter(s => s.status !== 'active')
                      .map(subscription => (
                        <tr key={subscription.id} className="border-b border-gray-800/50">
                          <td className="px-4 py-3 text-white">{subscription.name}</td>
                          <td className="px-4 py-3 text-gray-400">
                            {subscription.type === 'trading_bot' ? 'Trading Bot' : 'Software'}
                          </td>
                          <td className="px-4 py-3 text-right text-white">${subscription.price}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${getStatusColor(subscription.status)}`}>
                              {subscription.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400">
                            {formatDate(subscription.startDate)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Trading Bot Plans */}
      {selectedTab === 'trading' && (
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
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-light text-white">${plan.price}</span>
                <span className="text-gray-500 text-sm">/month</span>
              </div>

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

                {/* License Code Display for Desktop */}
                {generatedLicense && (
                  <div className="bg-background rounded-xl p-5 mb-6 text-left">
                    <p className="text-gray-400 text-xs mb-2">Your License Code</p>
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
                      Save this code! You'll need it to activate the desktop app.
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

                {/* Download Links for Desktop */}
                {generatedLicense && (
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
