import React from 'react';

/** Minimal fee-flow diagram — studio grey, no color accents */
const PricingHeroGraphic: React.FC = () => {
  return (
    <div
      className="mx-auto mb-12 w-full max-w-[280px]"
      aria-hidden
    >
      <svg
        viewBox="0 0 280 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
      >
        <defs>
          <linearGradient id="pricing-glass" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.35)" />
          </linearGradient>
        </defs>

        {/* connectors */}
        <path
          d="M72 36 H108 M172 36 H208"
          stroke="#c5c5cb"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M108 36 L136 36 L148 28 L160 36 L172 36"
          stroke="#a1a1aa"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.7"
        />

        {/* node 1 — no platform fee */}
        <rect x="8" y="14" width="64" height="44" rx="14" fill="url(#pricing-glass)" stroke="#c5c5cb" strokeWidth="1" />
        <circle cx="40" cy="32" r="10" stroke="#71717a" strokeWidth="1.25" fill="none" />
        <path d="M34 38 L46 26" stroke="#71717a" strokeWidth="1.25" strokeLinecap="round" />
        <text x="40" y="52" textAnchor="middle" fill="#71717a" fontSize="8" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
          FREE
        </text>

        {/* node 2 — bot / trade */}
        <rect x="108" y="14" width="64" height="44" rx="14" fill="url(#pricing-glass)" stroke="#c5c5cb" strokeWidth="1" />
        <rect x="128" y="26" width="24" height="16" rx="4" stroke="#52525b" strokeWidth="1.25" fill="none" />
        <circle cx="134" cy="32" r="2" fill="#52525b" />
        <circle cx="146" cy="32" r="2" fill="#52525b" />
        <text x="140" y="52" textAnchor="middle" fill="#71717a" fontSize="8" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
          BOT
        </text>

        {/* node 3 — gain */}
        <rect x="208" y="14" width="64" height="44" rx="14" fill="url(#pricing-glass)" stroke="#c5c5cb" strokeWidth="1" />
        <path
          d="M228 40 L236 32 L244 36 L252 26"
          stroke="#0a0a0a"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <text x="240" y="52" textAnchor="middle" fill="#71717a" fontSize="8" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
          GAIN
        </text>
      </svg>
      <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[#a1a1aa]">
        No platform fee · fee on gain only
      </p>
    </div>
  );
};

export default PricingHeroGraphic;
