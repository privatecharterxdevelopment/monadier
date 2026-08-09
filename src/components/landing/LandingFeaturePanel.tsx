import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { goToOpenApp } from '../../lib/appUrls';

function HowVisual() {
  return (
    <div className="al-feat-viz al-feat-viz--how" aria-hidden>
      <div className="al-feat-viz-float al-feat-viz-float--a">
        <svg viewBox="0 0 40 24" fill="none">
          <path d="M2 18 L10 12 L18 15 L28 6 L38 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <div className="al-feat-viz-float al-feat-viz-float--b">
        <svg viewBox="0 0 40 24" fill="none">
          <path d="M2 8 L12 14 L20 10 L30 16 L38 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <div className="al-feat-viz-search">
        <svg viewBox="0 0 120 120" fill="none">
          <circle cx="48" cy="48" r="28" stroke="currentColor" strokeWidth="5" />
          <path d="M68 68 L96 96" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
          <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="1" opacity="0.25" />
          <circle cx="48" cy="48" r="52" stroke="currentColor" strokeWidth="1" opacity="0.12" />
        </svg>
      </div>
    </div>
  );
}

function BotVisual() {
  const rows = [
    { label: 'Scan 200+ perps', tone: 'ok' },
    { label: 'Trail winners', tone: 'ok' },
    { label: 'Cut losers fast', tone: 'ok' },
    { label: 'Non-custodial', tone: 'muted' },
  ];

  return (
    <div className="al-feat-viz al-feat-viz--bot" aria-hidden>
      <ul className="al-feat-viz-list">
        {rows.map((r) => (
          <li key={r.label} className={`al-feat-viz-list-item al-feat-viz-list-item--${r.tone}`}>
            <span className="al-feat-viz-list-dot" />
            {r.label}
          </li>
        ))}
      </ul>
      <div className="al-feat-viz-donut">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="12" opacity="0.08" />
          <circle
            cx="60"
            cy="60"
            r="44"
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            strokeDasharray="76 200"
            strokeDashoffset="30"
            strokeLinecap="round"
            opacity="0.55"
          />
          <circle
            cx="60"
            cy="60"
            r="44"
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            strokeDasharray="40 236"
            strokeDashoffset="-50"
            strokeLinecap="round"
            opacity="0.28"
          />
          <circle
            cx="60"
            cy="60"
            r="44"
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            strokeDasharray="28 248"
            strokeDashoffset="-100"
            strokeLinecap="round"
            opacity="0.18"
          />
        </svg>
        <div className="al-feat-viz-donut-label">
          <strong>24/7</strong>
          <span>bot scanning</span>
        </div>
      </div>
    </div>
  );
}

function BettingVisual() {
  return (
    <div className="al-feat-viz al-feat-viz--betting" aria-hidden>
      <div className="al-feat-viz-pattern" />
      <div className="al-feat-viz-shield">
        <svg viewBox="0 0 48 56" fill="none">
          <path
            d="M24 2 L44 10 V26 C44 40 34 50 24 54 C14 50 4 40 4 26 V10 Z"
            stroke="currentColor"
            strokeWidth="2.2"
            fill="currentColor"
            fillOpacity="0.06"
          />
          <path d="M16 28 L22 34 L34 20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="al-feat-viz-slip">
        <div className="al-feat-viz-slip-avatar" />
        <div className="al-feat-viz-slip-lines">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function PerpsVisual() {
  /** Mini terminal: candles + depth chip — reads as pro perps, not a fingerprint. */
  const candles = [
    { x: 14, o: 72, c: 48, h: 40, l: 78, up: true },
    { x: 30, o: 50, c: 62, h: 44, l: 68, up: false },
    { x: 46, o: 60, c: 38, h: 32, l: 66, up: true },
    { x: 62, o: 42, c: 54, h: 36, l: 60, up: false },
    { x: 78, o: 52, c: 28, h: 22, l: 58, up: true },
    { x: 94, o: 30, c: 42, h: 24, l: 48, up: false },
    { x: 110, o: 40, c: 20, h: 14, l: 46, up: true },
  ];

  return (
    <div className="al-feat-viz al-feat-viz--perps" aria-hidden>
      <div className="al-feat-viz-perps-chip">
        <span className="al-feat-viz-perps-chip-pair">BTC-PERP</span>
        <span className="al-feat-viz-perps-chip-px">+1.8%</span>
      </div>
      <svg className="al-feat-viz-candles" viewBox="0 0 128 88" fill="none">
        {[22, 40, 58, 76].map((y) => (
          <line
            key={y}
            x1="8"
            y1={y}
            x2="120"
            y2={y}
            stroke="currentColor"
            strokeWidth="0.8"
            opacity="0.1"
          />
        ))}
        {candles.map((c) => (
          <g key={c.x} className={c.up ? 'al-feat-viz-candle--up' : 'al-feat-viz-candle--dn'}>
            <line
              x1={c.x}
              y1={c.h}
              x2={c.x}
              y2={c.l}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <rect
              x={c.x - 4}
              y={Math.min(c.o, c.c)}
              width="8"
              height={Math.max(4, Math.abs(c.c - c.o))}
              rx="1.2"
              fill="currentColor"
            />
          </g>
        ))}
        <path
          d="M10 70 C28 66 40 52 56 40 C72 28 88 34 104 22 C112 16 118 18 122 14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.35"
        />
      </svg>
    </div>
  );
}

const VISUALS = {
  how: HowVisual,
  bot: BotVisual,
  betting: BettingVisual,
  perps: PerpsVisual,
} as const;

const CARDS = [
  { id: 'how' as const, span: 'how', to: '/how-it-works', app: null as string | null },
  { id: 'bot' as const, span: 'bot', to: null, app: '?section=bot' },
  { id: 'betting' as const, span: 'betting', to: '/ai-sports-betting', app: null },
  { id: 'perps' as const, span: 'perps', to: null, app: '' },
];

/** Bento feature cards — unequal sizes, light grey, product visuals. */
const LandingFeaturePanel: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section className="landing-al-features" aria-label={t('landing.features.title')}>
      <div className="landing-al-features-panel">
        <div className="landing-al-features-bento">
          {CARDS.map((card, i) => {
            const Visual = VISUALS[card.id];
            const className = `landing-al-features-card landing-al-features-card--${card.span}`;
            const body = (
              <>
                <span className="landing-al-features-card-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="landing-al-features-card-copy">
                  <h3 className="landing-al-features-card-title">
                    {t(`landing.features.cards.${card.id}.title`)}
                  </h3>
                  <p className="landing-al-features-card-text">
                    {t(`landing.features.cards.${card.id}.text`)}
                  </p>
                </div>
                <Visual />
              </>
            );

            if (card.to) {
              return (
                <Link key={card.id} to={card.to} className={className}>
                  {body}
                </Link>
              );
            }

            return (
              <button
                key={card.id}
                type="button"
                className={className}
                onClick={() => goToOpenApp(card.app ?? '', false)}
              >
                {body}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default LandingFeaturePanel;
