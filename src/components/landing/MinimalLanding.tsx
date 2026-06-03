import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import LandingNav from './LandingNav';
import LandingCta from './LandingCta';

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

const MinimalLanding: React.FC = () => {
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  return (
    <div
      className="landing-studio fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#e8e8ec]"
      style={{ isolation: 'isolate' }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, #efeff2 0%, #e4e4e8 50%, #e0e0e6 100%)',
        }}
        aria-hidden
      />
      <div className="relative z-10 flex flex-col h-full min-h-0">
        <LandingNav variant="light" />

        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-20 pb-8 text-center">
          <motion.h1
            {...fade(0.08)}
            className="text-[2.1rem] sm:text-5xl md:text-[3.5rem] font-display font-semibold leading-[1.06] tracking-tighter max-w-3xl"
          >
            <span className="text-[#9ca3af]">Hedge-fund grade bot.</span>
            <br />
            <span className="text-[#0a0a0a]">Fully on-chain.</span>
          </motion.h1>

          <motion.p
            {...fade(0.18)}
            className="mt-6 text-sm md:text-lg text-[#52525b] max-w-lg leading-relaxed tracking-normal"
          >
            Put your money to work, automatically, 24/7.
          </motion.p>

          <motion.div {...fade(0.28)} className="mt-12 md:mt-14 flex justify-center">
            <LandingCta />
          </motion.div>
        </div>

        <footer className="shrink-0 pb-5 text-center">
          <p className="text-[10px] text-[#a1a1aa] tracking-[0.2em] uppercase">
            © {new Date().getFullYear()} Monadier
          </p>
        </footer>
      </div>
    </div>
  );
};

export default MinimalLanding;
