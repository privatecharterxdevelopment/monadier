import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TRUSTED_TRADER_AVATARS } from '../../lib/landing/trustedTraderAvatars';
import { formatLandingUserCount, getLandingUserCount } from '../../lib/landingUserCounter';

type Props = {
  worldwide?: boolean;
};

const LandingSocialProof: React.FC<Props> = ({ worldwide = false }) => {
  const { t } = useTranslation();
  const countLabel = useMemo(() => formatLandingUserCount(getLandingUserCount()), []);

  return (
    <div className="landing-gmx-social-proof" aria-label={t('landing.socialProof.aria')}>
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
        {t('landing.socialProof.before')}
        <strong>{countLabel}</strong>
        {worldwide
          ? t('landing.socialProof.afterWorldwide')
          : t('landing.socialProof.after')}
      </p>
    </div>
  );
};

export default LandingSocialProof;
