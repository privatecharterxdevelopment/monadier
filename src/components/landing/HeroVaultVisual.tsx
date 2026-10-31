import React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

/**
 * Foreground vault sculpture (CSS/SVG). Replace with Blender GLB via HeroVault3D when ready.
 * Drop file at public/models/vault-hero.glb
 */
const HeroVaultVisual: React.FC = () => {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, 80]);
  const scale = useTransform(scrollY, [0, 400], [1, 0.94]);

  return (
    <motion.div
      className="absolute inset-x-0 bottom-0 h-[min(52vh,520px)] flex items-end justify-center pointer-events-none select-none"
      style={{ y, scale }}
      aria-hidden
    >
      <div className="relative w-full max-w-5xl h-full flex items-end justify-center">
        {/* Floor reflection */}
        <div
          className="absolute bottom-[8%] left-1/2 -translate-x-1/2 w-[70%] h-24 rounded-[100%] opacity-30"
          style={{
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.12) 0%, transparent 70%)',
            filter: 'blur(24px)',
          }}
        />

        <svg
          viewBox="0 0 600 400"
          className="w-full max-w-3xl h-auto translate-y-[12%] md:translate-y-[8%]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="chrome" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f4f4f5" />
              <stop offset="35%" stopColor="#a1a1aa" />
              <stop offset="65%" stopColor="#52525b" />
              <stop offset="100%" stopColor="#e4e4e7" />
            </linearGradient>
            <linearGradient id="chrome-dim" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#3f3f46" />
              <stop offset="100%" stopColor="#d4d4d8" />
            </linearGradient>
            <linearGradient id="arb-accent" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#28A0F0" stopOpacity="0" />
              <stop offset="50%" stopColor="#28A0F0" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#28A0F0" stopOpacity="0" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer ring */}
          <ellipse cx="300" cy="220" rx="220" ry="72" stroke="url(#chrome)" strokeWidth="1.5" opacity="0.35" />
          <ellipse cx="300" cy="220" rx="195" ry="64" stroke="url(#arb-accent)" strokeWidth="2" opacity="0.6" />

          {/* Vault body — layered arcs */}
          <path
            d="M120 240 C120 120 480 120 480 240 C480 300 120 300 120 240Z"
            fill="url(#chrome-dim)"
            opacity="0.15"
          />
          <ellipse cx="300" cy="200" rx="140" ry="100" stroke="url(#chrome)" strokeWidth="2" filter="url(#glow)" />
          <ellipse cx="300" cy="200" rx="115" ry="82" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />

          {/* Core vault door */}
          <rect x="235" y="145" width="130" height="130" rx="16" stroke="url(#chrome)" strokeWidth="2.5" fill="rgba(255,255,255,0.03)" />
          <path d="M300 165 L300 255 M265 210 L335 210" stroke="url(#chrome)" strokeWidth="2" strokeLinecap="round" opacity="0.9" />

          {/* Floating chain links — decentralized motif */}
          <circle cx="95" cy="175" r="14" stroke="url(#chrome)" strokeWidth="1.5" opacity="0.5" />
          <circle cx="505" cy="175" r="14" stroke="url(#chrome)" strokeWidth="1.5" opacity="0.5" />
          <circle cx="75" cy="255" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
          <circle cx="525" cy="255" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

          {/* Base platform */}
          <ellipse cx="300" cy="310" rx="180" ry="28" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        </svg>
      </div>

      {/* Fade into page bg */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#08080a] to-transparent" />
    </motion.div>
  );
};

export default HeroVaultVisual;
