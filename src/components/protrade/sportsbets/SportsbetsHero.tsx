import React from 'react';
import { Trophy } from 'lucide-react';

type Props = {
  marketCount: number;
  syncing?: boolean;
};

const SportsbetsHero: React.FC<Props> = ({ marketCount, syncing }) => (
  <section className="hl-sb-hero" aria-label="Betting overview">
    <div className="hl-sb-hero-pattern" aria-hidden />
    <div className="hl-sb-hero-inner">
      <span className="hl-sb-hero-kicker">
        <Trophy size={14} strokeWidth={2.25} aria-hidden />
        Hyperliquid prediction markets
      </span>
      <h1 className="hl-sb-hero-title">Sports &amp; event betting</h1>
      <p className="hl-sb-hero-sub">
        Live odds on World Cup, crypto targets, and macro — wallet-signed on HIP-4.
      </p>
      <div className="hl-sb-hero-stats">
        <span className="hl-sb-hero-stat">
          <strong>{marketCount}</strong> markets live
        </span>
        <span className="hl-sb-hero-stat">
          <span className={`hl-sb-live-dot ${syncing ? 'hl-sb-live-dot--sync' : ''}`} />
          {syncing ? 'Syncing…' : 'Prices updating'}
        </span>
      </div>
    </div>
  </section>
);

export default SportsbetsHero;
