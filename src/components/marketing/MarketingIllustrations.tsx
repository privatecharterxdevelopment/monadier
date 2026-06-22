import React from 'react';

/** Compact bot AI orb — matches landing homepage promo */
export const MktBotAiVisual: React.FC = () => (
  <div className="landing-bento-ai-stage mkt-card-visual-inner" aria-hidden>
    <div className="landing-bento-ai-orbit">
      <span className="landing-bento-ai-ring landing-bento-ai-ring--outer" />
      <span className="landing-bento-ai-ring landing-bento-ai-ring--inner" />
      <span className="landing-bento-ai-core">
        <span className="landing-bento-ai-core-glow" />
        AI
      </span>
    </div>
    <div className="landing-bento-ai-pills">
      <span className="landing-bento-ai-pill landing-bento-ai-pill--a">Scanning HL</span>
      <span className="landing-bento-ai-pill landing-bento-ai-pill--b">BTC LONG 81%</span>
    </div>
    <svg className="landing-bento-ai-spark" viewBox="0 0 240 80" preserveAspectRatio="none">
      <path
        className="landing-bento-ai-spark-line"
        d="M0 58 L30 52 L60 56 L90 38 L120 44 L150 28 L180 34 L210 20 L240 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  </div>
);

export const MktBotScanVisual: React.FC = () => (
  <div className="landing-bento-mock landing-bento-mock--bot mkt-card-visual-inner" aria-hidden>
    <div className="landing-bento-mock-scan">
      <span className="landing-bento-mock-pill landing-bento-mock-pill--live">Scan</span>
      <span className="landing-bento-mock-pill">ETH LONG 78%</span>
      <span className="landing-bento-mock-pill landing-bento-mock-pill--muted">1m · 5m · 1h</span>
    </div>
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
          fill="url(#mktChartGrad)"
          opacity="0.35"
        />
        <defs>
          <linearGradient id="mktChartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  </div>
);

export const MktMarketsGridVisual: React.FC = () => {
  const pairs = ['BTC', 'ETH', 'SOL', 'HYPE', 'ARB', 'DOGE', 'AVAX', 'LINK'];
  return (
    <div className="landing-bento-mock landing-bento-mock--markets mkt-card-visual-inner" aria-hidden>
      <div className="landing-bento-mock-pair-grid">
        {pairs.map((p, i) => (
          <span
            key={p}
            className={`landing-bento-mock-pair${i === 0 ? ' landing-bento-mock-pair--hot' : ''}`}
          >
            {p}
          </span>
        ))}
      </div>
    </div>
  );
};

export const MktWalletVisual: React.FC = () => (
  <div className="mkt-illus mkt-illus--wallet" aria-hidden>
    <div className="mkt-illus-wallet-card">
      <span className="mkt-illus-wallet-chip" />
      <span className="mkt-illus-wallet-line mkt-illus-wallet-line--lg" />
      <span className="mkt-illus-wallet-line" />
    </div>
    <div className="mkt-illus-wallet-badge">0xF7…469c</div>
  </div>
);

export const MktDepositVisual: React.FC = () => (
  <div className="mkt-illus mkt-illus--flow" aria-hidden>
    <div className="mkt-illus-flow-node">Wallet</div>
    <div className="mkt-illus-flow-arrow" />
    <div className="mkt-illus-flow-node mkt-illus-flow-node--hl">HL USDC</div>
    <div className="mkt-illus-flow-amount">+$38.00</div>
  </div>
);

export const MktWithdrawVisual: React.FC = () => (
  <div className="mkt-illus mkt-illus--flow mkt-illus--flow-reverse" aria-hidden>
    <div className="mkt-illus-flow-node mkt-illus-flow-node--hl">HL USDC</div>
    <div className="mkt-illus-flow-arrow" />
    <div className="mkt-illus-flow-node">Wallet</div>
    <div className="mkt-illus-flow-amount mkt-illus-flow-amount--green">Profit</div>
  </div>
);

export const MktBettingVisual: React.FC = () => (
  <div className="landing-bento-mock landing-bento-mock--predictions mkt-card-visual-inner" aria-hidden>
    <div className="landing-bento-mock-stat-row">
      <div className="landing-bento-mock-stat">
        <span className="landing-bento-mock-stat-val">120+</span>
        <span className="landing-bento-mock-stat-lbl">Markets</span>
      </div>
      <div className="landing-bento-mock-stat">
        <span className="landing-bento-mock-stat-val">Yes</span>
        <span className="landing-bento-mock-stat-lbl">64¢</span>
      </div>
      <div className="landing-bento-mock-stat">
        <span className="landing-bento-mock-stat-val">No</span>
        <span className="landing-bento-mock-stat-lbl">36¢</span>
      </div>
    </div>
    <div className="landing-bento-mock-tags">
      <span>Sports</span>
      <span>Macro</span>
      <span>HIP-4</span>
    </div>
  </div>
);

export const MktSparkChartVisual: React.FC = () => (
  <div className="mkt-illus mkt-illus--spark" aria-hidden>
    <svg viewBox="0 0 200 72" preserveAspectRatio="none">
      <path
        d="M0 56 L28 48 L56 52 L84 30 L112 38 L140 22 L168 28 L200 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  </div>
);

export const MktFeeVisual: React.FC = () => (
  <div className="mkt-illus mkt-illus--fee" aria-hidden>
    <div className="mkt-illus-fee-bar">
      <span className="mkt-illus-fee-seg mkt-illus-fee-seg--you">90%</span>
      <span className="mkt-illus-fee-seg mkt-illus-fee-seg--fee">10%</span>
    </div>
    <p className="mkt-illus-fee-caption">Success fee on profit only</p>
  </div>
);

export const MktTeamVisual: React.FC = () => (
  <div className="mkt-illus mkt-illus--team" aria-hidden>
    <div className="mkt-illus-team-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="mkt-illus-team-dot" />
      ))}
    </div>
    <p className="mkt-illus-team-label">6 engineers · ETH Zurich</p>
  </div>
);

export const MktRoadmapVisual: React.FC<{ step: number; active?: boolean }> = ({
  step,
  active = false,
}) => (
  <div
    className={`mkt-illus mkt-illus--roadmap${active ? ' mkt-illus--roadmap-active' : ''}`}
    aria-hidden
  >
    <span className="mkt-illus-roadmap-num">{String(step).padStart(2, '0')}</span>
    <div className="mkt-illus-roadmap-track">
      <span className="mkt-illus-roadmap-fill" style={{ width: `${Math.min(step * 12, 100)}%` }} />
    </div>
  </div>
);
