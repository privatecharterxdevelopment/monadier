import React from 'react';

type Props = {
  marketCount: number;
  syncing?: boolean;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
};

const SportsbetsHero: React.FC<Props> = ({
  marketCount,
  syncing,
  onRefresh,
  refreshDisabled,
}) => (
  <header className="hl-sb-head">
    <div className="hl-sb-head-copy">
      <h1 className="hl-sb-head-title">Betting</h1>
      <p className="hl-sb-head-sub">World Cup, crypto &amp; macro · HIP-4 markets</p>
    </div>
    <div className="hl-sb-head-meta">
      <span className="hl-sb-head-stat">
        <span className={`hl-sb-live-dot ${syncing ? 'hl-sb-live-dot--sync' : ''}`} />
        {marketCount} markets · {syncing ? 'Syncing' : 'Live'}
      </span>
      {onRefresh ? (
        <button
          type="button"
          className="hl-sb-head-refresh"
          onClick={onRefresh}
          disabled={refreshDisabled}
        >
          Refresh
        </button>
      ) : null}
    </div>
  </header>
);

export default SportsbetsHero;
