import React from 'react';
import { Trophy } from 'lucide-react';
import type { HlOutcomeQuestion } from '../../../lib/hyperliquid/outcomes/types';
import { resolveBettingCategory } from '../../../lib/hyperliquid/outcomes/categories';
import { eventVisual } from '../../../lib/sports/teamVisuals';
import TeamBadge from './TeamBadge';

type Props = {
  marketCount: number;
  syncing?: boolean;
  featured?: HlOutcomeQuestion | null;
};

const SportsbetsHero: React.FC<Props> = ({ marketCount, syncing, featured }) => {
  const category = featured ? resolveBettingCategory(featured) : 'sports';
  const visuals = featured ? eventVisual(featured.name, category) : { emoji: '⚽', flagUrls: [] as string[] };
  const topLegs = featured?.legs.slice(0, 4) ?? [];

  return (
    <section className="hl-sb-hero" aria-label="Betting overview">
      <div className="hl-sb-hero-pattern" aria-hidden />
      <div className="hl-sb-hero-inner">
        <div className="hl-sb-hero-copy">
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

        {featured ? (
          <div className="hl-sb-hero-feature">
            <span className="hl-sb-hero-feature-label">Featured</span>
            <div className="hl-sb-hero-feature-head">
              <span className="hl-sb-hero-feature-emoji" aria-hidden>
                {visuals.emoji}
              </span>
              {visuals.flagUrls.length >= 2 ? (
                <div className="hl-sb-match-flags hl-sb-match-flags--hero">
                  <img src={visuals.flagUrls[0]} alt="" width={36} height={27} loading="lazy" />
                  <span className="hl-sb-match-vs">vs</span>
                  <img src={visuals.flagUrls[1]} alt="" width={36} height={27} loading="lazy" />
                </div>
              ) : null}
              <p className="hl-sb-hero-feature-name">{featured.name}</p>
            </div>
            {topLegs.length > 0 ? (
              <div className="hl-sb-hero-teams">
                {topLegs.map((leg) => (
                  <span key={leg.outcomeId} className="hl-sb-hero-team">
                    <TeamBadge name={leg.name} size={20} />
                    <span>{leg.name}</span>
                  </span>
                ))}
                {featured.legs.length > topLegs.length ? (
                  <span className="hl-sb-hero-team hl-sb-hero-team--more">
                    +{featured.legs.length - topLegs.length} more
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default SportsbetsHero;
