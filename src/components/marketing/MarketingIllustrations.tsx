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

/* —— Unique card scenes (one per marketing card) —— */

const Scene: React.FC<{ id: string; className?: string; children: React.ReactNode }> = ({
  id,
  className = '',
  children,
}) => (
  <div className={`mkt-illus-scene mkt-card-visual-inner ${className}`.trim()} data-scene={id} aria-hidden>
    {children}
  </div>
);

export const MktHowItWorksHeroVisual: React.FC = () => (
  <Scene id="how-hero" className="mkt-scene--pipeline">
    <div className="mkt-pipe mkt-pipe--1"><span>Wallet</span><i /></div>
    <div className="mkt-pipe mkt-pipe--2"><span>HL</span><i /></div>
    <div className="mkt-pipe mkt-pipe--3"><span>Bot</span><i /></div>
    <div className="mkt-pipe mkt-pipe--4"><span>Cash out</span></div>
  </Scene>
);

export const MktMtfStackVisual: React.FC = () => (
  <Scene id="mtf-stack" className="mkt-scene--mtf">
    {['1m', '5m', '15m', '1h'].map((tf, i) => (
      <div key={tf} className="mkt-mtf-row" style={{ ['--i' as string]: i }}>
        <span>{tf}</span>
        <span className="mkt-mtf-bar" />
        <em>LONG</em>
      </div>
    ))}
  </Scene>
);

export const MktQuantStackVisual: React.FC = () => (
  <Scene id="quant-stack" className="mkt-scene--nodes">
    <div className="mkt-node mkt-node--a">Mom</div>
    <div className="mkt-node mkt-node--b">Vol</div>
    <div className="mkt-node mkt-node--c">Mean</div>
    <div className="mkt-node mkt-node--hub">Signal</div>
  </Scene>
);

export const MktConfidenceGaugeVisual: React.FC = () => (
  <Scene id="confidence" className="mkt-scene--gauge">
    <svg viewBox="0 0 120 72" className="mkt-gauge-svg">
      <path d="M12 60 A48 48 0 0 1 108 60" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="8" strokeLinecap="round" />
      <path d="M12 60 A48 48 0 0 1 92 28" fill="none" stroke="#107663" strokeWidth="8" strokeLinecap="round" />
      <text x="60" y="58" textAnchor="middle" className="mkt-gauge-val">72%</text>
    </svg>
    <span className="mkt-gauge-label">Entry threshold</span>
  </Scene>
);

export const MktRiskGatesVisual: React.FC = () => (
  <Scene id="risk-gates" className="mkt-scene--shields">
    {['Size', 'Lev', 'Slots'].map((g) => (
      <div key={g} className="mkt-shield">
        <span className="mkt-shield-icon">✓</span>
        <span>{g}</span>
      </div>
    ))}
  </Scene>
);

export const MktDynamicTrailVisual: React.FC = () => (
  <Scene id="trail" className="mkt-scene--trail">
    <svg viewBox="0 0 200 80" preserveAspectRatio="none">
      <path d="M0 58 L40 50 L80 44 L120 30 L160 22 L200 18" fill="none" stroke="rgba(16,118,99,0.35)" strokeWidth="2" />
      <path d="M0 58 L40 50 L80 44 L120 30 L160 22 L200 18" fill="url(#trailFill)" opacity="0.2" />
      <path d="M0 62 L200 26" fill="none" stroke="#107663" strokeWidth="2" strokeDasharray="6 4" />
      <circle cx="160" cy="22" r="4" fill="#107663" />
      <defs>
        <linearGradient id="trailFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#107663" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#107663" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
    <span className="mkt-trail-tag">ATR trail</span>
  </Scene>
);

export const MktHlExecVisual: React.FC = () => (
  <Scene id="hl-exec" className="mkt-scene--hl">
    <div className="mkt-hl-core">HL</div>
    <div className="mkt-hl-rays">
      <span>Fill</span>
      <span>Mark</span>
      <span>Settle</span>
    </div>
  </Scene>
);

export const MktRadarScanVisual: React.FC = () => (
  <Scene id="radar" className="mkt-scene--radar">
    <div className="mkt-radar-disc">
      <span className="mkt-radar-sweep" />
      <span className="mkt-radar-blip mkt-radar-blip--a" />
      <span className="mkt-radar-blip mkt-radar-blip--b" />
      <span className="mkt-radar-blip mkt-radar-blip--c" />
    </div>
    <span className="mkt-radar-caption">200+ HL perps</span>
  </Scene>
);

export const MktScoreRankVisual: React.FC = () => (
  <Scene id="score-rank" className="mkt-scene--rank">
    {[
      ['ETH', '78%'],
      ['BTC', '74%'],
      ['SOL', '69%'],
    ].map(([coin, score], i) => (
      <div key={coin} className="mkt-rank-row" style={{ ['--rank' as string]: 3 - i }}>
        <span>{coin}</span>
        <span className="mkt-rank-bar" />
        <strong>{score}</strong>
      </div>
    ))}
  </Scene>
);

export const MktPositionSlotsVisual: React.FC = () => (
  <Scene id="positions" className="mkt-scene--slots">
    {['BTC LONG', 'ETH LONG', '—'].map((slot, i) => (
      <div key={slot} className={`mkt-slot${i < 2 ? ' mkt-slot--on' : ''}`}>{slot}</div>
    ))}
  </Scene>
);

export const MktRiskDialVisual: React.FC = () => (
  <Scene id="risk-dial" className="mkt-scene--dial">
    <div className="mkt-dial">
      <span className="mkt-dial-needle" />
      <span className="mkt-dial-val">12%</span>
    </div>
    <span className="mkt-dial-cap">Max exposure</span>
  </Scene>
);

export const MktLedgerVisual: React.FC = () => (
  <Scene id="ledger" className="mkt-scene--ledger">
    {[
      ['BTC close', '+$4.20'],
      ['ETH close', '+$1.85'],
      ['SOL open', '—'],
    ].map(([row, pnl]) => (
      <div key={row} className="mkt-ledger-row">
        <span>{row}</span>
        <span className={pnl.startsWith('+') ? 'mkt-ledger-pos' : ''}>{pnl}</span>
      </div>
    ))}
  </Scene>
);

export const MktNoFeeVisual: React.FC = () => (
  <Scene id="no-fee" className="mkt-scene--zero">
    <span className="mkt-zero-badge">$0</span>
    <span className="mkt-zero-label">Platform fee</span>
  </Scene>
);

export const MktGasCoveredVisual: React.FC = () => (
  <Scene id="gas" className="mkt-scene--gas">
    <div className="mkt-gas-pump">⛽</div>
    <div className="mkt-gas-stamp">Covered</div>
    <span className="mkt-gas-sub">Arbitrum gas on us</span>
  </Scene>
);

export const MktProfitShareVisual: React.FC = () => (
  <Scene id="profit-share" className="mkt-scene--donut">
    <svg viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="28" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="12" />
      <circle cx="40" cy="40" r="28" fill="none" stroke="#107663" strokeWidth="12" strokeDasharray="140 36" transform="rotate(-90 40 40)" />
      <text x="40" y="44" textAnchor="middle" fontSize="14" fontWeight="600">90%</text>
    </svg>
    <span>You keep gains</span>
  </Scene>
);

export const MktHlFeesVisual: React.FC = () => (
  <Scene id="hl-fees" className="mkt-scene--receipt">
    <div className="mkt-receipt">
      <span>Open fee</span>
      <span>Funding</span>
      <span>Close fee</span>
      <strong>HL standard</strong>
    </div>
  </Scene>
);

export const MktSlippageVisual: React.FC = () => (
  <Scene id="slippage" className="mkt-scene--spread">
    <div className="mkt-spread-bid">Bid 64,210</div>
    <div className="mkt-spread-mid">↔</div>
    <div className="mkt-spread-ask">Ask 64,218</div>
  </Scene>
);

export const MktCashOutVisual: React.FC = () => (
  <Scene id="cashout" className="mkt-scene--cashout">
    <div className="mkt-cashout-card">
      <span className="mkt-cashout-title">Yes · Lakers</span>
      <span className="mkt-cashout-pnl">+$12.40</span>
      <span className="mkt-cashout-btn">Sell early</span>
    </div>
  </Scene>
);

export const MktAgentApproveVisual: React.FC = () => (
  <Scene id="agent" className="mkt-scene--agent">
    <div className="mkt-agent-ring" />
    <span className="mkt-agent-label">HL agent</span>
    <span className="mkt-agent-status">Approved ✓</span>
  </Scene>
);

export const MktUptimeVisual: React.FC = () => (
  <Scene id="uptime" className="mkt-scene--uptime">
    <span className="mkt-uptime-val">24/7</span>
    <div className="mkt-uptime-bars">
      {Array.from({ length: 12 }).map((_, i) => (
        <span key={i} className="mkt-uptime-bar" style={{ ['--h' as string]: 20 + (i % 5) * 12 }} />
      ))}
    </div>
  </Scene>
);

export const MktControlPanelVisual: React.FC = () => (
  <Scene id="control" className="mkt-scene--control">
    <button type="button" className="mkt-ctrl mkt-ctrl--stop">Stop</button>
    <button type="button" className="mkt-ctrl mkt-ctrl--close">Close all</button>
    <button type="button" className="mkt-ctrl mkt-ctrl--wd">Withdraw</button>
  </Scene>
);

/* Bot architecture — one scene per pipeline feature */
export const MktArchMtfVisual: React.FC = () => <MktMtfStackVisual />;
export const MktArchGatesVisual: React.FC = () => <MktRiskGatesVisual />;
export const MktArchLiquidityVisual: React.FC = () => <MktMarketsGridVisual />;
export const MktArchMomentumVisual: React.FC = () => <MktQuantStackVisual />;
export const MktArchPumpGuardVisual: React.FC = () => (
  <Scene id="pump-guard" className="mkt-scene--guard">
    <svg viewBox="0 0 200 72" preserveAspectRatio="none">
      <path d="M0 50 L60 48 L100 20 L140 24 L200 16" fill="none" stroke="rgba(220,38,38,0.5)" strokeWidth="2" />
    </svg>
    <span className="mkt-guard-badge">No FOMO</span>
  </Scene>
);
export const MktArchTrailVisual: React.FC = () => <MktDynamicTrailVisual />;
export const MktArchWinnersVisual: React.FC = () => (
  <Scene id="winners-run" className="mkt-scene--run">
    <span className="mkt-run-tag">Peak +$8.40</span>
    <svg viewBox="0 0 200 64" preserveAspectRatio="none" className="mkt-run-chart">
      <path d="M0 52 L50 46 L100 32 L150 20 L200 12" fill="none" stroke="#107663" strokeWidth="2.5" />
      <path d="M0 56 L200 28" fill="none" stroke="#107663" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" />
    </svg>
  </Scene>
);
export const MktArchSlotsVisual: React.FC = () => <MktPositionSlotsVisual />;
export const MktArchLeverageVisual: React.FC = () => <MktRiskDialVisual />;
export const MktArchAutoVisual: React.FC = () => <MktHlExecVisual />;

/* Roadmap — unique scene per milestone */
export const MktRoadmapBotVisual: React.FC = () => <MktBotAiVisual />;
export const MktRoadmapCompanyVisual: React.FC = () => (
  <Scene id="rm-company" className="mkt-scene--building">
    <div className="mkt-building">
      <span /><span /><span />
    </div>
    <span>CH · GmbH</span>
  </Scene>
);
export const MktRoadmapVaultVisual: React.FC = () => (
  <Scene id="rm-vault" className="mkt-scene--vault-factory">
    <div className="mkt-vault-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <span key={i} className="mkt-vault-cell" />
      ))}
    </div>
    <span>Isolated vaults</span>
  </Scene>
);
export const MktRoadmapReferralVisual: React.FC = () => (
  <Scene id="rm-referral" className="mkt-scene--referral">
    <div className="mkt-ref-link">monadier.io/r/you</div>
    <div className="mkt-ref-reward">+ USDC</div>
  </Scene>
);
export const MktRoadmapChartsVisual: React.FC = () => (
  <Scene id="rm-charts" className="mkt-scene--charts">
    <div className="mkt-chart-tile mkt-chart-tile--a" />
    <div className="mkt-chart-tile mkt-chart-tile--b" />
    <div className="mkt-chart-tile mkt-chart-tile--c" />
    <span>More timeframes</span>
  </Scene>
);
export const MktRoadmapAuditVisual: React.FC = () => (
  <Scene id="rm-audit" className="mkt-scene--audit">
    <div className="mkt-audit-shield">CertiK</div>
    <span className="mkt-audit-check">✓ Verified</span>
  </Scene>
);
export const MktRoadmapPrizeVisual: React.FC = () => (
  <Scene id="rm-prize" className="mkt-scene--prize">
    <span className="mkt-prize-cup">🏆</span>
    <span className="mkt-prize-pool">Prize pool</span>
  </Scene>
);
export const MktRoadmapSupportVisual: React.FC = () => (
  <Scene id="rm-support" className="mkt-scene--email">
    <div className="mkt-email-envelope" />
    <span>Email only</span>
  </Scene>
);

export const ROADMAP_CARD_VISUALS = [
  MktRoadmapBotVisual,
  MktRoadmapCompanyVisual,
  MktRoadmapVaultVisual,
  MktRoadmapReferralVisual,
  MktRoadmapChartsVisual,
  MktRoadmapAuditVisual,
  MktRoadmapPrizeVisual,
  MktRoadmapSupportVisual,
] as const;

export const BOT_ARCHITECTURE_VISUALS = [
  MktArchMtfVisual,
  MktArchGatesVisual,
  MktArchLiquidityVisual,
  MktArchMomentumVisual,
  MktArchPumpGuardVisual,
  MktArchTrailVisual,
  MktArchWinnersVisual,
  MktArchSlotsVisual,
  MktArchLeverageVisual,
  MktArchAutoVisual,
] as const;
