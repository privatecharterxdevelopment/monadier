import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CircleOff,
  Fuel,
  TrendingUp,
  Wallet,
  ArrowLeftRight,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import CookieConsent from '../components/ui/CookieConsent';
import PricingHeroGraphic from '../components/marketing/PricingHeroGraphic';

const steps: { title: string; text: string; icon: LucideIcon }[] = [
  {
    icon: CircleOff,
    title: 'No platform fee',
    text: 'No subscription, no hidden platform charge, and no fee just to run the bot.',
  },
  {
    icon: Fuel,
    title: 'Gas covered for you',
    text: 'Network gas on Arbitrum for bot trades is paid by Monadier — not billed to you per trade.',
  },
  {
    icon: TrendingUp,
    title: 'Pay when you gain',
    text: 'A success fee applies only on profitable closes — 10% of profit. If a trade loses, there is no success fee on that close.',
  },
  {
    icon: Wallet,
    title: 'You keep most of your gains',
    text: 'On winning trades you keep the bulk of profit after the success fee and normal market costs.',
  },
  {
    icon: ArrowLeftRight,
    title: 'GMX execution costs',
    text: 'Standard GMX open/close, funding, and execution fees apply per position — the same as trading on GMX directly.',
  },
  {
    icon: Activity,
    title: 'Slippage & liquidity',
    text: 'Execution price can differ slightly from the quote depending on size and liquidity. Major pairs on Arbitrum usually see tighter spreads.',
  },
];

const PricingPage: React.FC = () => {
  return (
    <div className="auth-page min-h-[100dvh]">
      <LandingNav variant="light" />

      <main className="flex flex-col items-center px-6 pt-28 pb-20">
        <div className="w-full max-w-lg mx-auto text-center">
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-[#0a0a0a] tracking-tighter mb-5">
            Pricing
          </h1>

          <p className="text-sm md:text-base text-[#52525b] leading-relaxed mb-3 max-w-md mx-auto">
            Transparent pricing. No platform fee — you mainly pay when the bot gains.
          </p>
          <p className="text-sm text-[#71717a] leading-relaxed mb-8 max-w-sm mx-auto">
            Full breakdowns and live numbers are in your dashboard before you trade.
          </p>

          <PricingHeroGraphic />

          <div className="space-y-4 mb-14">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="glass-step">
                  <div className="glass-step-icon">
                    <Icon size={20} strokeWidth={1.75} aria-hidden />
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[#a1a1aa] mb-3">
                    {String(i + 1).padStart(2, '0')}
                  </p>
                  <h2 className="font-display text-lg font-semibold text-[#0a0a0a] mb-2">
                    {step.title}
                  </h2>
                  <p className="text-sm text-[#52525b] leading-relaxed max-w-xs mx-auto">{step.text}</p>
                </div>
              );
            })}
          </div>

          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-semibold text-[#0a0a0a] border border-[#c5c5cb] bg-white/50 backdrop-blur-xl hover:bg-white/70 transition-colors"
          >
            Get started
            <ArrowRight size={16} strokeWidth={2.5} />
          </Link>

          <p className="mt-10 text-[11px] text-[#a1a1aa] tracking-wide max-w-xs mx-auto">
            This is not financial advice. Fees may change; see dashboard for live details.
          </p>
        </div>
      </main>

      <CookieConsent />
    </div>
  );
};

export default PricingPage;
