import React from 'react';

type Partner = {
  id: string;
  name: string;
  mark: React.ReactNode;
};

const LOGO_GREY = '#9ca3af';

const ArbitrumMark = () => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden className="landing-gmx-partner-mark-svg">
    <path
      d="M16 3L4 25h7l2.5-5L16 25l6.5-10.5L25 25h7L16 3z"
      fill={LOGO_GREY}
    />
    <path d="M16 17.5 11.5 25h9L16 17.5z" fill={LOGO_GREY} opacity="0.55" />
  </svg>
);

const GmxMark = () => (
  <svg viewBox="0 0 56 20" fill="none" aria-hidden className="landing-gmx-partner-mark-svg">
    <text
      x="0"
      y="16"
      fill={LOGO_GREY}
      fontSize="17"
      fontWeight="700"
      fontFamily="system-ui, -apple-system, sans-serif"
      letterSpacing="-0.05em"
    >
      GMX
    </text>
  </svg>
);

const UsdcMark = () => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden className="landing-gmx-partner-mark-svg">
    <circle cx="16" cy="16" r="13" stroke={LOGO_GREY} strokeWidth="2" />
    <path
      d="M19.4 11.4c-.8-1-2.1-1.6-3.7-1.6-2.2 0-3.6 1.1-3.6 2.7 0 1.4.9 2.2 3.1 2.8l1.4.4c1.5.4 2.1.8 2.1 1.7 0 1-.9 1.7-2.5 1.7-1.5 0-2.6-.6-3-1.7l-2 .7c.6 1.7 2.3 2.7 4.9 2.7 2.9 0 4.8-1.4 4.8-3.4 0-1.5-.9-2.4-3-3l-1.4-.4c-1.4-.4-2-.9-2-1.7 0-.9.8-1.5 2.2-1.5 1.2 0 2 .5 2.4 1.3l1.9-.6z"
      fill={LOGO_GREY}
    />
    <path d="M16 9v14" stroke={LOGO_GREY} strokeWidth="1.5" />
  </svg>
);

const ReownMark = () => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden className="landing-gmx-partner-mark-svg">
    <rect x="4" y="4" width="10" height="10" rx="2" fill={LOGO_GREY} />
    <rect x="18" y="4" width="10" height="10" rx="2" fill={LOGO_GREY} opacity="0.65" />
    <rect x="4" y="18" width="10" height="10" rx="2" fill={LOGO_GREY} opacity="0.65" />
    <rect x="18" y="18" width="10" height="10" rx="2" fill={LOGO_GREY} opacity="0.4" />
  </svg>
);

const PARTNERS: Partner[] = [
  { id: 'arbitrum', name: 'Arbitrum', mark: <ArbitrumMark /> },
  { id: 'gmx', name: 'GMX', mark: <GmxMark /> },
  { id: 'usdc', name: 'USDC', mark: <UsdcMark /> },
  { id: 'reown', name: 'Reown', mark: <ReownMark /> },
];

const REPEAT_COUNT = 3;

const PartnerItem: React.FC<{ partner: Partner }> = ({ partner }) => (
  <div
    className={`landing-gmx-partner-item landing-gmx-partner-item--${partner.id}`}
    title={partner.name}
  >
    <span className="landing-gmx-partner-mark">{partner.mark}</span>
    <span className="landing-gmx-partner-name">{partner.name}</span>
  </div>
);

const PartnerGroup: React.FC<{ partners: Partner[] }> = ({ partners }) => (
  <div className="landing-gmx-partners-group">
    {partners.map((partner) => (
      <PartnerItem key={partner.id} partner={partner} />
    ))}
  </div>
);

const LandingPartnerLogos: React.FC = () => {
  const groups = Array.from({ length: REPEAT_COUNT }, (_, index) => (
    <PartnerGroup key={index} partners={PARTNERS} />
  ));

  return (
    <section className="landing-gmx-partners" aria-label="Technology partners">
      <p className="landing-gmx-partners-eyebrow">Powered by</p>
      <div className="landing-gmx-partners-viewport">
        <div className="landing-gmx-partners-track">
          {groups}
        </div>
      </div>
    </section>
  );
};

export default LandingPartnerLogos;
