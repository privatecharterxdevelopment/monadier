import React from 'react';

/** Step 1 — wallet + HL spot USDC for outcome markets */
export const SportsBetConnectVisual: React.FC = () => (
  <div className="mkt-sports-step-visual mkt-sports-step-visual--connect" aria-hidden>
    <div className="mkt-sports-step-wallet">
      <span className="mkt-sports-step-wallet-chip" />
      <div className="mkt-sports-step-wallet-lines">
        <span className="mkt-sports-step-wallet-line mkt-sports-step-wallet-line--lg" />
        <span className="mkt-sports-step-wallet-line" />
      </div>
    </div>
    <div className="mkt-sports-step-fund">
      <span className="mkt-sports-step-fund-label">HL Spot · USDC</span>
      <span className="mkt-sports-step-fund-amount">$248.00</span>
    </div>
    <span className="mkt-sports-step-pill">Outcome markets</span>
  </div>
);

/** Step 2 — live market odds preview */
export const SportsBetPickVisual: React.FC = () => (
  <div
    className="landing-bento-mock landing-bento-mock--predictions mkt-card-visual-inner mkt-sports-step-visual--pick"
    aria-hidden
  >
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

/** Step 3 — open bet + early sell */
export const SportsBetCashOutVisual: React.FC = () => (
  <div className="mkt-illus-scene mkt-card-visual-inner mkt-scene--cashout mkt-sports-step-visual--cashout" aria-hidden>
    <div className="mkt-cashout-card">
      <span className="mkt-cashout-title">Yes · Lakers</span>
      <span className="mkt-cashout-pnl">+$12.40</span>
      <span className="mkt-cashout-btn">Sell early</span>
    </div>
  </div>
);
