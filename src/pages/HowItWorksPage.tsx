import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import CookieConsent from '../components/ui/CookieConsent';

const steps = [
  {
    title: 'Connect your wallet',
    text: 'Sign in and link MetaMask or WalletConnect. Non-custodial — we never see your private keys.',
  },
  {
    title: 'Deposit to your vault',
    text: 'Add USDC to your on-chain bot vault on Arbitrum. You choose how much capital to use.',
  },
  {
    title: 'The bot runs for you',
    text: 'Our hedge-fund strategy executes on GMX automatically — 24/7, 365 days a year. It analyzes, enters, and manages positions.',
  },
  {
    title: 'Withdraw when you want',
    text: 'Profits stay in your vault balance until you withdraw USDC back to your wallet. You stay in control.',
  },
];

const HowItWorksPage: React.FC = () => {
  return (
    <div className="auth-page min-h-[100dvh]">
      <LandingNav variant="light" />

      <main className="flex flex-col items-center px-6 pt-28 pb-20">
        <div className="w-full max-w-lg mx-auto text-center">
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-[#0a0a0a] tracking-tighter mb-5">
            How it works
          </h1>

          <p className="text-sm md:text-base text-[#52525b] leading-relaxed mb-3 max-w-md mx-auto">
            A proven hedge-fund strategy, packaged as a bot. You set it up once — it handles the rest.
          </p>
          <p className="text-sm text-[#71717a] leading-relaxed mb-14 max-w-sm mx-auto">
            Set your risk. Optional leverage for experienced traders only.
          </p>

          <div className="space-y-4 mb-14">
            {steps.map((step, i) => (
              <div key={step.title} className="glass-step">
                <p className="text-[10px] uppercase tracking-[0.24em] text-[#a1a1aa] mb-3">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h2 className="font-display text-lg font-semibold text-[#0a0a0a] mb-2">
                  {step.title}
                </h2>
                <p className="text-sm text-[#52525b] leading-relaxed max-w-xs mx-auto">{step.text}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-semibold text-[#0a0a0a] border border-[#c5c5cb] bg-white/50 backdrop-blur-xl hover:bg-white/70 transition-colors"
            >
              Get started
              <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
            <Link
              to="/your-funds"
              className="text-sm text-[#71717a] hover:text-[#0a0a0a] transition-colors px-4 py-2"
            >
              How your funds are stored
            </Link>
          </div>

          <p className="text-[11px] text-[#a1a1aa] tracking-wide max-w-xs mx-auto">
            This is not financial advice. Your capital is at risk.
          </p>
        </div>
      </main>

      <CookieConsent />
    </div>
  );
};

export default HowItWorksPage;
