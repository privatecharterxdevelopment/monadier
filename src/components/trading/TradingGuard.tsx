import React from 'react';
import { Link } from 'react-router-dom';
import { User, Wallet, CreditCard, AlertTriangle, ArrowRight } from 'lucide-react';
import { useOnboarding, canUserTrade } from '../../hooks/useOnboarding';

interface TradingGuardProps {
  children: React.ReactNode;
}

const TradingGuard: React.FC<TradingGuardProps> = ({ children }) => {
  const onboarding = useOnboarding();
  const { canTrade, reason } = canUserTrade(onboarding);

  if (onboarding.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (canTrade) {
    return <>{children}</>;
  }

  // Show what's missing
  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="bg-gradient-to-b from-zinc-900 to-zinc-800 border border-zinc-700 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-yellow-400" />
        </div>

        <h2 className="text-2xl font-semibold text-primary mb-2">
          Complete Setup to Trade
        </h2>
        <p className="text-secondary mb-8">
          {reason || 'Please complete the following steps to start trading'}
        </p>

        <div className="space-y-4 text-left">
          {/* Profile Step */}
          <div className={`flex items-center gap-4 p-4 rounded-lg ${
            onboarding.steps.profile.complete
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-white/55 border border-[#c5c5cb]'
          }`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              onboarding.steps.profile.complete ? 'bg-green-500/20' : 'bg-black/[0.04]'
            }`}>
              <User className={`w-5 h-5 ${
                onboarding.steps.profile.complete ? 'text-green-400' : 'text-secondary'
              }`} />
            </div>
            <div className="flex-1">
              <p className={`font-medium ${
                onboarding.steps.profile.complete ? 'text-green-400' : 'text-primary'
              }`}>
                {onboarding.steps.profile.complete ? 'Profile Complete' : 'Complete Your Profile'}
              </p>
              <p className="text-sm text-muted">
                {onboarding.steps.profile.complete
                  ? 'Name and country added'
                  : 'Add your name and country'}
              </p>
            </div>
            {!onboarding.steps.profile.complete && (
              <Link
                to="/dashboard/settings"
                className="px-4 py-2 bg-accent text-black rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors flex items-center gap-2"
              >
                Complete <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>

          {/* Wallet Step */}
          <div className={`flex items-center gap-4 p-4 rounded-lg ${
            onboarding.steps.wallet.complete
              ? 'bg-green-500/10 border border-green-500/30'
              : onboarding.steps.profile.complete
                ? 'bg-white/55 border border-[#c5c5cb]'
                : 'bg-white/35 border border-[#c5c5cb] opacity-60'
          }`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              onboarding.steps.wallet.complete ? 'bg-green-500/20' : 'bg-black/[0.04]'
            }`}>
              <Wallet className={`w-5 h-5 ${
                onboarding.steps.wallet.complete ? 'text-green-400' : 'text-secondary'
              }`} />
            </div>
            <div className="flex-1">
              <p className={`font-medium ${
                onboarding.steps.wallet.complete ? 'text-green-400' : 'text-primary'
              }`}>
                {onboarding.steps.wallet.complete ? 'Wallet Connected' : 'Connect Wallet'}
              </p>
              <p className="text-sm text-muted">
                {onboarding.steps.wallet.complete
                  ? `${onboarding.steps.wallet.address?.slice(0, 6)}...${onboarding.steps.wallet.address?.slice(-4)}`
                  : 'Connect your trading wallet'}
              </p>
            </div>
            {!onboarding.steps.wallet.complete && onboarding.steps.profile.complete && (
              <span className="px-4 py-2 bg-white/60 border border-[#c5c5cb] text-primary rounded-lg text-sm">
                Connect below
              </span>
            )}
          </div>

          {/* Subscription Step */}
          <div className={`flex items-center gap-4 p-4 rounded-lg ${
            onboarding.steps.subscription.complete
              ? 'bg-green-500/10 border border-green-500/30'
              : onboarding.steps.wallet.complete
                ? 'bg-white/55 border border-[#c5c5cb]'
                : 'bg-white/35 border border-[#c5c5cb] opacity-60'
          }`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              onboarding.steps.subscription.complete ? 'bg-green-500/20' : 'bg-black/[0.04]'
            }`}>
              <CreditCard className={`w-5 h-5 ${
                onboarding.steps.subscription.complete ? 'text-green-400' : 'text-secondary'
              }`} />
            </div>
            <div className="flex-1">
              <p className={`font-medium ${
                onboarding.steps.subscription.complete ? 'text-green-400' : 'text-primary'
              }`}>
                {onboarding.steps.subscription.complete ? 'Subscription Active' : 'Choose a Plan'}
              </p>
              <p className="text-sm text-muted">
                {onboarding.steps.subscription.complete
                  ? `${onboarding.steps.subscription.plan} plan active`
                  : 'Subscribe to start real trading'}
              </p>
            </div>
            {!onboarding.steps.subscription.complete && onboarding.steps.wallet.complete && (
              <Link
                to="/dashboard/subscriptions"
                className="px-4 py-2 bg-accent text-black rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors flex items-center gap-2"
              >
                View Plans <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>

        {/* Free tier notice */}
        {onboarding.steps.subscription.plan === 'free' && (
          <div className="mt-6 p-4 bg-white/50 border border-[#c5c5cb] rounded-lg">
            <p className="text-sm text-secondary">
              <span className="text-[#52525b] font-medium">Free Plan:</span> You can paper trade to test strategies.
              Upgrade to a paid plan for real trading with the bot.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TradingGuard;
