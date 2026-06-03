import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronDown, Layers, Shield, Bot } from 'lucide-react';
import HeroVaultVisual from './HeroVaultVisual';

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
});

const LandingHero: React.FC = () => {
  const scrollToContent = () => {
    document.getElementById('landing-content')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-[100dvh] overflow-hidden">
      <div className="relative z-10 flex flex-col items-center text-center px-4 pt-28 md:pt-32 pb-[min(48vh,440px)] max-w-4xl mx-auto">
        <motion.p
          {...fade(0)}
          className="text-[11px] md:text-xs uppercase tracking-[0.22em] text-zinc-500 font-medium mb-6 md:mb-8"
        >
          Systematic trading · Arbitrum · Non-custodial
        </motion.p>

        <motion.h1
          {...fade(0.08)}
          className="text-[2.35rem] sm:text-5xl md:text-6xl lg:text-[4.25rem] font-display font-semibold leading-[1.05] tracking-tighter text-balance"
        >
          <span className="text-zinc-500">Hedge-fund grade bot.</span>
          <br />
          <span className="text-zinc-50">Fully decentralized.</span>
        </motion.h1>

        <motion.p
          {...fade(0.16)}
          className="mt-6 md:mt-8 text-base md:text-lg text-zinc-500 max-w-xl leading-relaxed tracking-normal font-normal"
        >
          Quantitative strategies, pooled USDC vault, and GMX execution on Arbitrum.
          You keep your keys — profits settle on-chain, withdraw when you choose.
        </motion.p>

        {/* Glass callout — reference-style pill */}
        <motion.div
          {...fade(0.24)}
          className="mt-8 md:mt-10 glass-pill-inline flex items-center gap-3 pl-4 pr-2 py-2 max-w-md w-full sm:w-auto"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] border border-white/[0.08]">
            <Bot size={16} className="text-zinc-300" strokeWidth={1.75} />
          </div>
          <p className="text-left text-[13px] text-zinc-400 tracking-normal flex-1 min-w-0">
            <span className="text-zinc-200 font-medium">Monadier vault</span>
            <span className="text-zinc-600"> · </span>
            GMX V2 · Arbitrum One
          </p>
          <div
            className="h-9 w-9 shrink-0 rounded-full border border-black/[0.08] bg-white/[0.04] flex items-center justify-center"
            title="Live on Arbitrum"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-400 opacity-30" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-300" />
            </span>
          </div>
        </motion.div>

        <motion.div
          {...fade(0.32)}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-zinc-600 tracking-normal"
        >
          <span className="inline-flex items-center gap-1.5">
            <Shield size={13} className="text-zinc-500" strokeWidth={1.75} />
            Non-custodial vault
          </span>
          <span className="hidden sm:inline text-zinc-700">|</span>
          <span className="inline-flex items-center gap-1.5">
            <Layers size={13} className="text-zinc-500" strokeWidth={1.75} />
            On-chain balances
          </span>
        </motion.div>

        <motion.div
          {...fade(0.4)}
          className="mt-10 flex flex-col sm:flex-row gap-3 justify-center w-full sm:w-auto"
        >
          <Link to="/register" className="w-full sm:w-auto">
            <button
              type="button"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-[#08080a] rounded-full text-sm font-semibold hover:bg-zinc-100 transition-colors"
            >
              Start trading
              <ArrowRight size={16} strokeWidth={2.5} />
            </button>
          </Link>
          <Link to="/how-it-works" className="w-full sm:w-auto">
            <button
              type="button"
              className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 rounded-full text-sm font-medium text-zinc-400 border border-white/[0.1] bg-black/[0.04] backdrop-blur-md hover:bg-white/[0.06] hover:text-zinc-200 transition-colors"
            >
              How it works
            </button>
          </Link>
        </motion.div>
      </div>

      <HeroVaultVisual />

      <motion.button
        type="button"
        onClick={scrollToContent}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 text-zinc-600 hover:text-zinc-400 transition-colors group"
        aria-label="Scroll to explore"
      >
        <span className="text-[10px] uppercase tracking-[0.25em] font-medium">Scroll to explore</span>
        <ChevronDown size={18} className="animate-bounce opacity-60 group-hover:opacity-100" strokeWidth={1.5} />
      </motion.button>
    </section>
  );
};

export default LandingHero;
