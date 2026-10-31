import React from 'react';

const LandingPerpsVisual: React.FC = () => (
  <div className="landing-apple-perps-visual" aria-hidden>
    <div className="landing-bento-mock-chart">
      <svg viewBox="0 0 200 64" preserveAspectRatio="none">
        <path
          d="M0 48 L24 42 L48 50 L72 28 L96 34 L120 18 L144 24 L168 12 L200 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M0 48 L24 42 L48 50 L72 28 L96 34 L120 18 L144 24 L168 12 L200 8 L200 64 L0 64 Z"
          fill="url(#applePerpsGrad)"
          opacity="0.35"
        />
        <defs>
          <linearGradient id="applePerpsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
    <div className="landing-apple-perps-pairs">
      {['BTC', 'ETH', 'SOL', 'HYPE'].map((pair, i) => (
        <span key={pair} className={i === 0 ? 'is-hot' : ''}>
          {pair}
        </span>
      ))}
    </div>
  </div>
);

export default LandingPerpsVisual;
