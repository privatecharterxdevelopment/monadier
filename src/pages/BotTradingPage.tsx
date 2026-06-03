import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import CookieConsent from '../components/ui/CookieConsent';

const steps = [
  {
    title: 'Connect your wallet',
    text: 'MetaMask or WalletConnect. Your keys stay with you.',
  },
  {
    title: 'Fund your bot vault',
    text: 'Add USDC on Arbitrum. You choose the amount.',
  },
  {
    title: 'Set risk & start',
    text: 'Pick your risk level. Leverage optional — experienced traders only.',
  },
];

const BotTradingPage: React.FC = () => {
  return (
    <div className="auth-page min-h-[100dvh]">
      <LandingNav variant="light" />

      <main className="flex flex-col items-center justify-center px-6 pt-28 pb-20 min-h-[calc(100dvh-5rem)]">
        <div className="w-full max-w-lg mx-auto text-center">
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-[#0a0a0a] tracking-tighter mb-5">
            Trading bot
          </h1>

          <p className="text-sm md:text-base text-[#52525b] leading-relaxed mb-3 max-w-md mx-auto">
            Executes automatically — 24/7, 365 days a year. You start it; it analyzes markets and
            targets roughly a 70% win rate.
          </p>
          <p className="text-sm text-[#71717a] leading-relaxed mb-14 max-w-sm mx-auto">
            Controlled by you and your wallet on Arbitrum.
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

          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-semibold text-[#0a0a0a] border border-[#c5c5cb] bg-white/50 backdrop-blur-xl hover:bg-white/70 transition-colors"
          >
            Get started
            <ArrowRight size={16} strokeWidth={2.5} />
          </Link>

          <p className="mt-10 text-[11px] text-[#a1a1aa] tracking-wide max-w-xs mx-auto">
            This is not financial advice. Your capital is at risk.
          </p>
        </div>
      </main>

      <CookieConsent />
    </div>
  );
};

export default BotTradingPage;
