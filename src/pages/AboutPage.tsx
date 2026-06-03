import React from 'react';
import LandingNav from '../components/landing/LandingNav';
import CookieConsent from '../components/ui/CookieConsent';

const AboutPage: React.FC = () => {
  return (
    <div className="auth-page min-h-[100dvh]">
      <LandingNav variant="light" />

      <main className="flex-1 flex items-center justify-center px-6 pt-28 pb-16">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-[#0a0a0a] tracking-tighter mb-10">
            About
          </h1>

          <div className="space-y-6 text-base md:text-lg text-[#52525b] leading-relaxed tracking-normal">
            <p>
              There is no &ldquo;about Monadier&rdquo; — we are a team of six IT engineers from
              Switzerland, ETH Zurich alumni. We turned a proven hedge-fund strategy into a
              fully automated, self-developed trading bot, and built this project to see how much
              people can earn with it.
            </p>
            <p>
              You start it — the bot works, analyzes markets, and targets roughly a 70% win rate.
              It is controlled by you and your wallet. No technical skills required to get going.
            </p>
            <p>
              Connect your wallet, add funds to your bot vault, choose your risk level, and optionally
              set leverage — leverage is for experienced traders only. You are the administrator;
              let it work for you, but know that your capital is at risk.
            </p>
          </div>

          <p className="mt-12 text-sm text-[#a1a1aa] tracking-wide">
            This is not financial advice.
          </p>
        </div>
      </main>

      <CookieConsent />
    </div>
  );
};

export default AboutPage;
