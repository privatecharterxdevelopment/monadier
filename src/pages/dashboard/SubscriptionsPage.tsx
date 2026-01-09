import React, { useState } from 'react';
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
  ExternalLink
} from 'lucide-react';
import { useSubscription, Subscription } from '../../contexts/SubscriptionContext';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAppKit } from '@reown/appkit/react';
import Card from '../../components/ui/Card';

// Payment receiving address (treasury)
const TREASURY_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f5bC12';

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
    refreshBalances
  } = useWeb3();
  const { open } = useAppKit();

  const [selectedTab, setSelectedTab] = useState<'current' | 'trading' | 'software'>('current');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'approving' | 'paying' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);

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
      icon: <Zap className="w-8 h-8" />,
      color: 'from-blue-500 to-blue-600',
      features: [
        'Up to $1,000 trading limit',
        'Basic trading pairs (6 pairs)',
        '5 trades per day',
        'Email support',
        '$1,000 credit line'
      ],
      creditLine: 1000
    },
    {
      id: 'pro',
      name: 'Professional',
      price: 199,
      billingCycle: 'monthly' as const,
      icon: <Crown className="w-8 h-8" />,
      color: 'from-purple-500 to-purple-600',
      popular: true,
      features: [
        'Up to $5,000 trading limit',
        'All trading pairs',
        '50 trades per day',
        'Priority support',
        'Advanced analytics',
        '$5,000 credit line'
      ],
      creditLine: 5000
    },
    {
      id: 'elite',
      name: 'Elite',
      price: 699,
      billingCycle: 'monthly' as const,
      icon: <Rocket className="w-8 h-8" />,
      color: 'from-amber-500 to-amber-600',
      features: [
        'Up to $10,000 trading limit',
        'All trading pairs',
        'Unlimited trades',
        '24/7 VIP support',
        'AI-powered strategies',
        'Custom alerts',
        '$15,000 credit line'
      ],
      creditLine: 15000
    }
  ];

  const softwarePlans = [
    {
      id: 'lifetime',
      name: 'Lifetime License',
      price: 999,
      billingCycle: 'one_time' as const,
      icon: <Download className="w-8 h-8" />,
      color: 'from-emerald-500 to-emerald-600',
      features: [
        'Downloadable desktop software',
        'Run locally on your machine',
        'Offline trading capability',
        'Lifetime updates included',
        'No monthly fees',
        'All trading pairs',
        'Unlimited trades',
        'Priority email support',
        '$25,000 credit line'
      ],
      creditLine: 25000,
      badge: 'One-Time Payment'
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

      // In production, this would:
      // 1. Approve the token transfer
      // 2. Call a payment contract or transfer to treasury
      // For now, simulate the approval process
      await approveToken(
        bestStablecoin.address,
        TREASURY_ADDRESS,
        selectedPlan.price.toString()
      );

      setPaymentStatus('paying');

      // Simulate payment transaction
      // In production: transfer tokens to treasury
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulated tx hash
      const hash = '0x' + Math.random().toString(16).slice(2, 66);
      setTxHash(hash);
      setPaymentStatus('success');

      // Add subscription after successful payment
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

      // Close modal after 3 seconds on success
      setTimeout(() => {
        setShowPurchaseModal(false);
        setSelectedPlan(null);
        setSelectedTab('current');
      }, 3000);

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
        return <Crown className="w-5 h-5 text-purple-400" />;
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
                ? 'bg-accent text-white'
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
                            subscription.tier === 'pro' ? 'bg-purple-500/10' :
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
              whileHover={{ scale: 1.02 }}
              className={`relative bg-card-dark rounded-xl border ${
                activeSubscription?.tier === plan.id
                  ? 'border-accent'
                  : 'border-gray-800'
              } p-6 transition-all`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent text-white text-xs font-medium rounded-full">
                  Popular
                </div>
              )}

              {activeSubscription?.tier === plan.id && (
                <div className="absolute -top-3 right-4 px-3 py-1 bg-green-500 text-white text-xs font-medium rounded-full">
                  Current
                </div>
              )}

              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center text-white mb-4`}>
                {plan.icon}
              </div>

              <h3 className="text-xl font-semibold text-white mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-light text-white">${plan.price}</span>
                <span className="text-gray-400">/month</span>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-gray-400">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePurchase(plan, 'trading_bot')}
                disabled={activeSubscription?.tier === plan.id}
                className={`w-full py-3 rounded-lg font-medium transition-all ${
                  activeSubscription?.tier === plan.id
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-accent hover:bg-accent-hover text-white'
                }`}
              >
                {activeSubscription?.tier === plan.id ? 'Current Plan' : 'Subscribe'}
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Software License */}
      {selectedTab === 'software' && (
        <div className="max-w-2xl mx-auto">
          {softwarePlans.map(plan => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative bg-card-dark rounded-xl border border-gray-800 p-8"
            >
              <div className="absolute -top-3 left-6 px-3 py-1 bg-emerald-500 text-white text-xs font-medium rounded-full">
                {plan.badge}
              </div>

              <div className="flex items-start gap-6 mb-6">
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center text-white`}>
                  {plan.icon}
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-white mb-1">{plan.name}</h3>
                  <p className="text-gray-400">
                    Own the software forever with a single payment
                  </p>
                </div>
              </div>

              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-5xl font-light text-white">${plan.price.toLocaleString()}</span>
                <span className="text-gray-400">one-time payment</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-gray-400">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Best Value</span>
                </div>
                <p className="text-gray-400 text-sm">
                  Save over $7,000 compared to paying monthly for the Elite plan over 1 year.
                  Run the trading bot locally on your own machine with full privacy.
                </p>
              </div>

              {subscriptions.find(s => s.tier === 'lifetime' && s.status === 'active') ? (
                <button
                  disabled
                  className="w-full py-4 bg-gray-700 text-gray-500 rounded-lg font-medium cursor-not-allowed"
                >
                  Already Owned
                </button>
              ) : (
                <button
                  onClick={() => handlePurchase(plan, 'software_license')}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
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
              <div className="text-center py-8">
                <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-green-400" />
                </div>
                <h2 className="text-2xl font-semibold text-white mb-2">Payment Successful!</h2>
                <p className="text-gray-400 mb-4">Your {selectedPlan.name} subscription is now active</p>
                {txHash && currentChain && (
                  <a
                    href={`${currentChain.blockExplorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-accent hover:text-accent-hover"
                  >
                    View Transaction <ExternalLink size={14} />
                  </a>
                )}
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
                    className="w-full py-4 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors mb-3 flex items-center justify-center gap-2"
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
