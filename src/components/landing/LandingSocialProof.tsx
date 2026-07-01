import React from 'react';
import { TRUSTED_TRADER_AVATARS } from '../../lib/landing/trustedTraderAvatars';

type Props = {
  worldwide?: boolean;
};

const LandingSocialProof: React.FC<Props> = ({ worldwide = false }) => (
  <div className="landing-gmx-social-proof" aria-label="Trusted by traders">
    <div className="landing-gmx-social-proof-avatars" aria-hidden>
      {TRUSTED_TRADER_AVATARS.map((trader, i) => (
        <span
          key={trader.name}
          className="landing-gmx-social-proof-avatar landing-gmx-social-proof-avatar--photo"
          style={{ zIndex: TRUSTED_TRADER_AVATARS.length - i }}
        >
          <img src={trader.src} alt="" loading="lazy" decoding="async" />
        </span>
      ))}
    </div>
    <p className="landing-gmx-social-proof-text">
      Trusted by <strong>100+</strong> traders{worldwide ? ' worldwide' : ''}
    </p>
  </div>
);

export default LandingSocialProof;
