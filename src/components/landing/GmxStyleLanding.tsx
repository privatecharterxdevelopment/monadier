import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LandingNav from './LandingNav';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const heroReveal = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

const HERO_MID_LINES = [
  'on GMX liquidity',
  'with automated perps',
  'with hedge-fund signals',
  'on Arbitrum',
  'with an AI agent that performs',
  'directly on blockchain',
] as const;

const HERO_MID_LONGEST = HERO_MID_LINES.reduce((a, b) => (a.length >= b.length ? a : b));

const ROTATE_MS = 3200;

const heroLineStyle = {
  margin: 0,
  padding: 0,
  lineHeight: 0.98,
  fontSize: 'inherit',
  fontWeight: 'inherit',
} as const;

const FAQ = [
  {
    q: 'How do I get started on Monadier?',
    a: 'Create an account, connect a wallet on Arbitrum, deposit USDC into the vault (minimum $50), configure bot settings, and enable auto-trade. No KYC for the trading bot itself.',
  },
  {
    q: 'Is my money safe in the vault?',
    a: 'Funds live in the Monadier V11 vault smart contract on Arbitrum. You deposit and withdraw from your own wallet. The bot can only trade for users who explicitly enable auto-trade.',
  },
  {
    q: 'How does Monadier compare on fees?',
    a: 'Trades route through GMX perpetual pools, so you benefit from deep liquidity and competitive execution. Platform fees are taken on notional as defined in the vault contract.',
  },
  {
    q: 'What chains are supported?',
    a: 'Trading and vault operations are on Arbitrum (chain ID 42161), where GMX V1 perps and our vault are deployed.',
  },
] as const;

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="landing-gmx-faq-item">
      <button type="button" className="landing-gmx-faq-q" onClick={() => setOpen((v) => !v)}>
        {q}
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <p className="landing-gmx-faq-a">{a}</p>}
    </div>
  );
}

const GmxStyleLanding: React.FC = () => {
  const [midIndex, setMidIndex] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMidIndex((i) => (i + 1) % HERO_MID_LINES.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  const midLine = HERO_MID_LINES[midIndex];

  return (
    <div className="landing-gmx">
      <LandingNav variant="light" layout="gmx" />

      <section className="landing-gmx-hero">
        <div className="landing-gmx-hero-shell">
          <div className="landing-gmx-hero-stage">
            <div className="landing-gmx-hero-stack">
              <div
                className="landing-gmx-hero-title"
                data-hero-version="static-3-rows"
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 0,
                    width: '100%',
                  }}
                >
                  <div style={{ ...heroLineStyle, color: '#0a0a0a' }}>Trade</div>
                  <div
                    aria-live="polite"
                    style={{
                      ...heroLineStyle,
                      display: 'grid',
                      width: 'max-content',
                      maxWidth: '100%',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        gridArea: '1 / 1',
                        visibility: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {HERO_MID_LONGEST}
                    </span>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={midLine}
                        style={{
                          gridArea: '1 / 1',
                          whiteSpace: 'nowrap',
                          color: '#9ca3af',
                          ...heroLineStyle,
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {midLine}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                  <div style={{ ...heroLineStyle, color: '#0a0a0a' }}>from your vault</div>
                </div>
              </div>
              <motion.div {...heroReveal(0.1)} className="landing-gmx-hero-bottom">
                <div className="landing-gmx-hero-bottom-left">
                  <div className="landing-gmx-hero-cta">
                    <Link to="/register" className="landing-gmx-btn-primary">
                      Trade now
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                  <p className="landing-gmx-hero-lead">
                    Decentralised permissionless on-chain trading with deep GMX liquidity and a
                    non-custodial vault — live on Arbitrum.
                  </p>
                </div>
                <div className="landing-gmx-hero-stats">
                  <div className="landing-gmx-hero-stat">
                    <div className="landing-gmx-hero-stat-value">24/7</div>
                    <div className="landing-gmx-hero-stat-label">Bot uptime</div>
                  </div>
                  <div className="landing-gmx-hero-stat">
                    <div className="landing-gmx-hero-stat-value">GMX</div>
                    <div className="landing-gmx-hero-stat-label">Execution</div>
                  </div>
                  <div className="landing-gmx-hero-stat">
                    <div className="landing-gmx-hero-stat-value">V11</div>
                    <div className="landing-gmx-hero-stat-label">Vault</div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
        <p className="landing-gmx-hero-scroll-hint" aria-hidden>
          Scroll for FAQ
        </p>
      </section>

      <section className="landing-gmx-section landing-gmx-faq-section">
        <div className="landing-gmx-container">
          <motion.h2 {...fadeUp(0)} className="landing-gmx-section-title">
            FAQ
          </motion.h2>
          <motion.div {...fadeUp(0.05)} className="landing-gmx-faq">
            {FAQ.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default GmxStyleLanding;
