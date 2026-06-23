import React from 'react';
import { Loader2 } from 'lucide-react';

const SportsbetsRegionLoading: React.FC = () => (
  <div className="hl-sb-region hl-sb-region--loading" role="status" aria-live="polite">
    <div className="hl-sb-region-bg" aria-hidden>
      <div className="hl-sb-region-glow hl-sb-region-glow--a" />
    </div>
    <div className="hl-sb-region-card hl-sb-region-card--loading">
      <Loader2 size={28} className="hl-spin" aria-hidden />
      <p className="hl-sb-region-title">Checking eligibility</p>
      <p className="hl-sb-region-copy">Verifying regional access for outcome markets…</p>
    </div>
  </div>
);

export default SportsbetsRegionLoading;
