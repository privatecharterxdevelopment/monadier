import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { User, Wallet, CreditCard, CheckCircle, ArrowRight, PartyPopper, X } from 'lucide-react';
import { useOnboarding } from '../../hooks/useOnboarding';
import confetti from 'canvas-confetti';

interface StepProps {
  icon: React.ReactNode;
  title: string;
  complete: boolean;
  current: boolean;
  link?: string;
}

const Step: React.FC<StepProps> = ({ icon, title, complete, current, link }) => {
  const content = (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
        complete
          ? 'bg-green-500/10 text-green-400'
          : current
          ? 'bg-accent/10 text-accent border border-accent/30'
          : 'bg-zinc-800/50 text-zinc-500'
      }`}
    >
      <div className={`${complete ? 'text-green-400' : current ? 'text-accent' : 'text-zinc-500'}`}>
        {complete ? <CheckCircle className="w-5 h-5" /> : icon}
      </div>
      <span className="text-sm font-medium">{title}</span>
      {current && !complete && <ArrowRight className="w-4 h-4 ml-auto" />}
    </div>
  );

  if (link && current && !complete) {
    return (
      <Link to={link} className="block hover:scale-[1.02] transition-transform">
        {content}
      </Link>
    );
  }

  return content;
};

const OnboardingBanner: React.FC = () => {
  const { isLoading, isComplete, currentStep, steps } = useOnboarding();
  const [showCelebration, setShowCelebration] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const previousCompleteRef = useRef<boolean | null>(null);
  const hasTriggeredConfetti = useRef(false);

  // Check if user just completed onboarding
  useEffect(() => {
    if (isLoading) return;

    // Check localStorage to see if we already celebrated
    const celebratedKey = 'onboarding_celebrated';
    const hasCelebrated = localStorage.getItem(celebratedKey) === 'true';

    if (isComplete && !hasCelebrated && !hasTriggeredConfetti.current) {
      // User just completed onboarding - celebrate!
      hasTriggeredConfetti.current = true;
      setShowCelebration(true);
      localStorage.setItem(celebratedKey, 'true');

      // Fire confetti!
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#FFD700', '#FFA500', '#FF6347', '#00FF00', '#00CED1']
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#FFD700', '#FFA500', '#FF6347', '#00FF00', '#00CED1']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };

      frame();

      // Also fire a big burst in the center
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#FFD700', '#FFA500', '#FF6347', '#00FF00', '#00CED1', '#9400D3']
        });
      }, 500);
    }

    previousCompleteRef.current = isComplete;
  }, [isComplete, isLoading]);

  if (isLoading) {
    return null;
  }

  // Show celebration banner
  if (showCelebration && !dismissed) {
    return (
      <div className="bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-500/30 rounded-xl p-6 mb-6 relative overflow-hidden">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-4 right-4 text-green-400/60 hover:text-green-400 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <PartyPopper className="w-8 h-8 text-green-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-green-400 mb-1">
              Setup Complete!
            </h3>
            <p className="text-green-300/80">
              You're all set to start trading. Good luck!
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <Link
            to="/dashboard/chart-trades"
            className="px-4 py-2 bg-green-500 text-black rounded-lg font-medium hover:bg-green-400 transition-colors"
          >
            Start Trading
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg font-medium hover:bg-green-500/30 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Don't show if onboarding is complete (and celebration dismissed/already celebrated)
  if (isComplete) {
    return null;
  }

  const completedSteps = [
    steps.profile.complete,
    steps.wallet.complete,
    steps.subscription.complete,
  ].filter(Boolean).length;

  return (
    <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 border border-zinc-700 rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Complete Your Setup</h3>
          <p className="text-sm text-zinc-400">
            {completedSteps}/3 steps completed
          </p>
        </div>
        <div className="w-24 h-2 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{ width: `${(completedSteps / 3) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Step
          icon={<User className="w-5 h-5" />}
          title="Complete Profile"
          complete={steps.profile.complete}
          current={currentStep === 'profile'}
          link="/dashboard/profile"
        />
        <Step
          icon={<Wallet className="w-5 h-5" />}
          title="Connect Wallet"
          complete={steps.wallet.complete}
          current={currentStep === 'wallet'}
          link="/dashboard/chart-trades"
        />
        <Step
          icon={<CreditCard className="w-5 h-5" />}
          title="Choose Plan"
          complete={steps.subscription.complete}
          current={currentStep === 'subscription'}
          link="/dashboard/subscriptions"
        />
      </div>

      {currentStep !== 'complete' && (
        <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg">
          <p className="text-sm text-zinc-300">
            {currentStep === 'profile' && (
              <>
                <span className="text-accent font-medium">Next:</span> Add your name and country in{' '}
                <Link to="/dashboard/profile" className="text-accent hover:underline">
                  Profile
                </Link>
              </>
            )}
            {currentStep === 'wallet' && (
              <>
                <span className="text-accent font-medium">Next:</span> Connect your wallet on the{' '}
                <Link to="/dashboard/chart-trades" className="text-accent hover:underline">
                  Trading Bot
                </Link>{' '}
                page
              </>
            )}
            {currentStep === 'subscription' && (
              <>
                <span className="text-accent font-medium">Next:</span> Choose a subscription plan to start trading{' '}
                <Link to="/dashboard/subscriptions" className="text-accent hover:underline">
                  View Plans
                </Link>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default OnboardingBanner;
