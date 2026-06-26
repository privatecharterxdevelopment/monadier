import React from 'react';

const TRADER_AVATARS = [
  { initials: 'AK', tone: 'violet' },
  { initials: 'JM', tone: 'sky' },
  { initials: 'SR', tone: 'mint' },
  { initials: 'LT', tone: 'amber' },
  { initials: 'NP', tone: 'rose' },
  { initials: 'DW', tone: 'slate' },
] as const;

const LandingSocialProof: React.FC = () => (
  <div className="landing-gmx-social-proof" aria-label="Trusted by traders">
    <div className="landing-gmx-social-proof-avatars" aria-hidden>
      {TRADER_AVATARS.map((trader, i) => (
        <span
          key={trader.initials}
          className={`landing-gmx-social-proof-avatar landing-gmx-social-proof-avatar--${trader.tone}`}
          style={{ zIndex: TRADER_AVATARS.length - i }}
        >
          {trader.initials}
        </span>
      ))}
    </div>
    <p className="landing-gmx-social-proof-text">
      Trusted by <strong>100+</strong> traders
    </p>
  </div>
);

export default LandingSocialProof;
