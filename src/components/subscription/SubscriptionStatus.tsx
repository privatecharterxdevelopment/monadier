import React from 'react';
import { motion } from 'framer-motion';
import {
  Crown,
  Zap,
  TrendingUp,
  Calendar,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  BarChart3,
  FileText,
  Sparkles,
  Download
} from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { SUBSCRIPTION_PLANS, formatPrice } from '../../lib/subscription';

interface SubscriptionStatusProps {
  onUpgrade?: () => void;
  onActivate?: () => void;
  compact?: boolean;
}

export const SubscriptionStatus: React.FC<SubscriptionStatusProps> = ({
  onUpgrade,
  onActivate,
  compact = false
}) => {
  const {
    subscription,
    isSubscribed,
    planTier,
    daysRemaining,
    dailyTradesRemaining
  } = useSubscription();

  // No subscription at all (shouldn't happen with auto free tier)
  if (!isSubscribed || !planTier) {
    return (
      <div className={`bg-card-dark rounded-xl border border-gray-800 ${compact ? 'p-3' : 'p-4'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-white font-medium">No Active Subscription</p>
              <p className="text-sm text-gray-400">Activate a license to start trading</p>
            </div>
          </div>
          <button
            onClick={onActivate}
            className="px-4 py-2 bg-accent hover:bg-accent-dark text-white font-medium rounded-lg transition-colors"
          >
            Activate
          </button>
        </div>
      </div>
    );
  }

  const plan = SUBSCRIPTION_PLANS[planTier];
  const isFree = planTier === 'free';
  const isLifetime = subscription?.billingCycle === 'lifetime';
  const isExpiringSoon = !isLifetime && daysRemaining !== -1 && daysRemaining <= 7 && daysRemaining > 0;
  const isExpired = !isLifetime && daysRemaining !== -1 && daysRemaining <= 0;

  // Get plan icon color
  const getPlanColor = () => {
    switch (planTier) {
      case 'elite':
      case 'desktop':
        return 'text-yellow-400';
      case 'pro':
        return 'text-accent';
      case 'starter':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const getPlanBg = () => {
    switch (planTier) {
      case 'elite':
      case 'desktop':
        return 'bg-yellow-500/20';
      case 'pro':
        return 'bg-white/10';
      case 'starter':
        return 'bg-blue-500/20';
      default:
        return 'bg-gray-700';
    }
  };

  const getPlanHeaderBg = () => {
    switch (planTier) {
      case 'elite':
      case 'desktop':
        return 'bg-white/5';
      case 'pro':
        return 'bg-white/5';
      case 'starter':
        return 'bg-white/5';
      default:
        return 'bg-gray-800/50';
    }
  };

  // Compact view for sidebar
  if (compact) {
    return (
      <div className="bg-card-dark rounded-xl border border-gray-800 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isFree ? (
              <FileText className="w-4 h-4 text-gray-400" />
            ) : (
              <Crown className={`w-4 h-4 ${getPlanColor()}`} />
            )}
            <span className="text-white font-medium text-sm">{plan.name}</span>
            {isFree && (
              <span className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">
                Paper
              </span>
            )}
            {plan.badge && (
              <span className={`px-1.5 py-0.5 text-xs rounded ${plan.popular ? 'bg-white/10 text-accent' : 'bg-green-500/20 text-green-400'}`}>
                {plan.badge}
              </span>
            )}
          </div>
          {!isLifetime && daysRemaining !== -1 && (
            <span className={`text-xs ${isExpiringSoon ? 'text-orange-400' : 'text-gray-400'}`}>
              {daysRemaining}d left
            </span>
          )}
          {isLifetime && (
            <span className="text-xs text-green-400">Lifetime</span>
          )}
        </div>
        {plan.features.dailyTradeLimit !== -1 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{
                  width: `${((plan.features.dailyTradeLimit - (dailyTradesRemaining === -1 ? 0 : dailyTradesRemaining)) / plan.features.dailyTradeLimit) * 100}%`
                }}
              />
            </div>
            <span className="text-xs text-gray-400">
              {dailyTradesRemaining}/{plan.features.dailyTradeLimit}
            </span>
          </div>
        )}
        {isFree && (
          <button
            onClick={onUpgrade}
            className="w-full mt-2 py-1.5 text-xs bg-white/10 hover:bg-white/15 text-accent rounded transition-colors"
          >
            Upgrade for Real Trading
          </button>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className={`p-4 ${getPlanHeaderBg()}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${getPlanBg()}`}>
              {planTier === 'desktop' ? (
                <Download className={`w-5 h-5 ${getPlanColor()}`} />
              ) : isFree ? (
                <FileText className="w-5 h-5 text-gray-400" />
              ) : (
                <Crown className={`w-5 h-5 ${getPlanColor()}`} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-bold">{plan.name} Plan</h3>
                {plan.badge && (
                  <span className={`px-2 py-0.5 text-xs rounded-full ${plan.popular ? 'bg-accent text-white' : 'bg-green-500 text-white'}`}>
                    {plan.badge}
                  </span>
                )}
                {isFree && (
                  <span className="px-2 py-0.5 text-xs bg-gray-600 text-white rounded-full">
                    Paper Trading
                  </span>
                )}
                {isLifetime && (
                  <span className="px-2 py-0.5 text-xs bg-green-500 text-white rounded-full">
                    Lifetime
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400">{plan.description}</p>
            </div>
          </div>
          {planTier !== 'elite' && planTier !== 'desktop' && (
            <button
              onClick={onUpgrade}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-accent rounded-lg transition-colors text-sm"
            >
              <Sparkles className="w-4 h-4" />
              Upgrade
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Free tier upgrade prompt */}
      {isFree && (
        <div className="p-4 bg-white/5 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Ready for real trading?</p>
              <p className="text-sm text-gray-400">
                Upgrade to Starter for just <span className="text-accent font-bold">$29/month</span>
              </p>
            </div>
            <button
              onClick={onUpgrade}
              className="px-4 py-2 bg-accent hover:bg-accent-dark text-white font-medium rounded-lg transition-colors"
            >
              Start Real Trading
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="p-4 space-y-4">
        {/* Expiration Warning */}
        {(isExpiringSoon || isExpired) && !isLifetime && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center gap-2 p-3 rounded-lg ${isExpired ? 'bg-red-500/10 border border-red-500/20' : 'bg-orange-500/10 border border-orange-500/20'}`}
          >
            <AlertTriangle className={`w-5 h-5 ${isExpired ? 'text-red-400' : 'text-orange-400'}`} />
            <div>
              <p className={`font-medium ${isExpired ? 'text-red-400' : 'text-orange-400'}`}>
                {isExpired ? 'Subscription Expired' : 'Expiring Soon'}
              </p>
              <p className="text-sm text-gray-400">
                {isExpired ? 'Please renew to continue trading' : `${daysRemaining} days remaining`}
              </p>
            </div>
            <button className={`ml-auto px-3 py-1.5 rounded-lg text-sm font-medium ${isExpired ? 'bg-red-500 hover:bg-red-600' : 'bg-orange-500 hover:bg-orange-600'} text-white transition-colors`}>
              Renew Now
            </button>
          </motion.div>
        )}

        {/* Usage Stats */}
        <div className="grid grid-cols-2 gap-3">
          {/* Daily Trades */}
          <div className="p-3 bg-background rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              <span className="text-sm text-gray-400">Daily Trades</span>
            </div>
            {plan.features.dailyTradeLimit === -1 ? (
              <p className="text-white font-bold">Unlimited</p>
            ) : (
              <>
                <p className="text-white font-bold">
                  {dailyTradesRemaining} / {plan.features.dailyTradeLimit}
                </p>
                <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{
                      width: `${((plan.features.dailyTradeLimit - (dailyTradesRemaining === -1 ? 0 : dailyTradesRemaining)) / plan.features.dailyTradeLimit) * 100}%`
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Days Remaining / Lifetime */}
          <div className="p-3 bg-background rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-green-400" />
              <span className="text-sm text-gray-400">
                {isLifetime ? 'License' : 'Days Left'}
              </span>
            </div>
            {isLifetime ? (
              <p className="text-green-400 font-bold">Lifetime Access</p>
            ) : (
              <>
                <p className={`font-bold ${isExpiringSoon ? 'text-orange-400' : 'text-white'}`}>
                  {daysRemaining === -1 ? 'Never' : `${daysRemaining} days`}
                </p>
                {subscription?.endDate && daysRemaining !== -1 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Expires {new Date(subscription.endDate).toLocaleDateString()}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Active Strategies */}
          <div className="p-3 bg-background rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-gray-400">Strategies</span>
            </div>
            <p className="text-white font-bold">
              {plan.features.maxActiveStrategies === -1 ? 'Unlimited' : plan.features.maxActiveStrategies}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {plan.features.strategies.join(', ')}
            </p>
          </div>

          {/* Chains */}
          <div className="p-3 bg-background rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-white" />
              <span className="text-sm text-gray-400">Chains</span>
            </div>
            <p className="text-white font-bold">{plan.features.chains.length} chains</p>
            <p className="text-xs text-gray-500 mt-1">
              {isFree ? 'Base, Polygon' : 'All supported'}
            </p>
          </div>
        </div>

        {/* Auto Renew Status (not for free or lifetime) */}
        {subscription?.autoRenew && !isLifetime && !isFree && (
          <div className="flex items-center justify-between p-3 bg-background rounded-lg">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-green-400" />
              <span className="text-sm text-gray-400">Auto-Renew</span>
            </div>
            <span className="text-green-400 text-sm font-medium">Enabled</span>
          </div>
        )}

        {/* Paper trading notice for free tier */}
        {isFree && (
          <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <FileText className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-blue-400 font-medium text-sm">Paper Trading Mode</p>
              <p className="text-xs text-gray-400">
                All trades are simulated. Upgrade to trade with real funds.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionStatus;
