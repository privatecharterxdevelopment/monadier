import React from 'react';
import { ArrowRight, Globe2, MapPin } from 'lucide-react';
import { goToOpenApp } from '../../../lib/appUrls';

type Props = {
  reason?: string;
  countryLabel?: string;
};

const SportsbetsRegionBlocked: React.FC<Props> = ({ reason, countryLabel }) => {
  const message =
    reason ??
    'Sports betting on Hyperliquid outcome markets is limited to eligible regions.';

  return (
    <div className="hl-sb-region">
      <div className="hl-sb-region-bg" aria-hidden>
        <div className="hl-sb-region-glow hl-sb-region-glow--a" />
        <div className="hl-sb-region-glow hl-sb-region-glow--b" />
      </div>

      <div className="hl-sb-region-card" role="alert">
        <div className="hl-sb-region-icon-wrap" aria-hidden>
          <Globe2 size={26} strokeWidth={1.75} />
        </div>

        <p className="hl-sb-region-kicker">Regional access</p>
        <h2 className="hl-sb-region-title">Betting isn&apos;t available in your region</h2>
        <p className="hl-sb-region-copy">{message}</p>

        {countryLabel ? (
          <div className="hl-sb-region-location">
            <MapPin size={14} strokeWidth={2} aria-hidden />
            <span className="hl-sb-region-location-label">Detected location</span>
            <span className="hl-sb-region-location-value">{countryLabel}</span>
          </div>
        ) : null}

        <div className="hl-sb-region-actions">
          <button
            type="button"
            className="hl-sb-region-btn hl-sb-region-btn--primary"
            onClick={() => goToOpenApp('', false)}
          >
            Trade perps instead
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <p className="hl-sb-region-footnote">
          Perps trading and the Monadier bot remain available. Outcome markets follow regional
          compliance rules.
        </p>
      </div>
    </div>
  );
};

export default SportsbetsRegionBlocked;
