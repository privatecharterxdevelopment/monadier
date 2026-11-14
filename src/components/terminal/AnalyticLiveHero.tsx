import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import type { EngineTfChip } from '../../lib/engineOpenTimeframes';

type Props = {
  botRunning: boolean;
  scanning: boolean;
  progress: number;
  coin?: string;
  statusLabel: string;
  statusTone: 'pos' | 'neg' | 'warn' | 'muted';
  focusCoin?: string;
  focusDir?: string;
  focusConf?: number | null;
  tfChips: EngineTfChip[];
};

const BAR_COUNT = 28;

function compactStatusLabel(label: string): string {
  const compact: Record<string, string> = {
    'Waiting confirmation': 'Waiting',
    'Opening trade': 'Opening',
    'Setup blocked': 'Blocked',
    'Order failed': 'Failed',
    'Unprotected position': 'No SL',
    'Position closed': 'Closed',
  };
  return compact[label] ?? label;
}

function barHeight(active: boolean, progress: number, index: number): string {
  if (!active) return '12%';
  const wave = Math.sin((progress / 100) * Math.PI * 2 + index * 0.55);
  const h = 22 + Math.abs(wave) * 58 + (index % 5) * 3;
  return `${Math.min(92, Math.round(h))}%`;
}

const AnalyticLiveHero: React.FC<Props> = ({
  botRunning,
  scanning,
  progress,
  coin,
  statusLabel,
  statusTone,
  focusCoin,
  focusDir,
  focusConf,
  tfChips,
}) => {
  const statusShort = useMemo(() => compactStatusLabel(statusLabel), [statusLabel]);
  const bars = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, i) => ({
        id: i,
        up: i % 2 === 0,
        height: barHeight(scanning, progress, i),
      })),
    [scanning, progress]
  );

  return (
    <div className="term-analytic-hero">
      <div className="term-analytic-hero__top">
        <div className="term-analytic-hero__title-row">
          <span className="term-analytic-hero__title">Engine live</span>
          <span className="term-analytic-hero__window">
            {scanning ? 'scan cycle' : botRunning ? 'standby' : 'paused'}
          </span>
        </div>
        <div className="term-analytic-hero__legend">
          <span className="term-analytic-legend term-analytic-legend--dn" title="Blocked / wait" />
          <span className="term-analytic-legend-label">Wait</span>
          <span className="term-analytic-legend term-analytic-legend--up" title="Aligned / pass" />
          <span className="term-analytic-legend-label">Pass</span>
        </div>
      </div>

      <div
        className={`term-analytic-bars${scanning ? ' term-analytic-bars--live' : ''}`}
        aria-hidden
      >
        {bars.map((b) => (
          <span
            key={b.id}
            className={`term-analytic-bar ${
              b.up ? 'term-analytic-bar--up' : 'term-analytic-bar--dn'
            }`}
            style={{ '--bar-h': b.height } as React.CSSProperties}
          />
        ))}
      </div>

      <div className="term-analytic-hero__stats">
        <div className="term-analytic-stat">
          <span className="term-analytic-stat__label">Status</span>
          <span
            className={`term-analytic-stat__value term-analytic-stat__value--${statusTone}`}
            title={statusLabel}
          >
            {scanning ? <Activity size={11} className="term-analysis-pulse" aria-hidden /> : null}
            <span className="term-analytic-stat__clip">{statusShort}</span>
          </span>
        </div>
        <div className="term-analytic-stat">
          <span className="term-analytic-stat__label">Focus</span>
          <span
            className="term-analytic-stat__value"
            title={
              focusCoin
                ? `${focusCoin} ${focusDir ?? ''} ${focusConf != null ? `${focusConf}%` : ''}`
                : coin?.toUpperCase()
            }
          >
            <span className="term-analytic-stat__clip">
              {focusCoin ? (
                <>
                  {focusCoin}{' '}
                  <span
                    className={
                      focusDir === 'LONG'
                        ? 'term-pnl-pos'
                        : focusDir === 'SHORT'
                          ? 'term-pnl-neg'
                          : ''
                    }
                  >
                    {focusDir === 'LONG' ? 'L' : focusDir === 'SHORT' ? 'S' : focusDir}
                  </span>
                  {focusConf != null ? ` ${focusConf}` : ''}
                </>
              ) : coin ? (
                coin.toUpperCase()
              ) : (
                '—'
              )}
            </span>
          </span>
        </div>
        <div className="term-analytic-stat">
          <span className="term-analytic-stat__label">Cycle</span>
          <span className="term-analytic-stat__value">{scanning ? `${Math.round(progress)}%` : '—'}</span>
        </div>
      </div>

      {tfChips.length > 0 ? (
        <div className="term-analytic-tf-row" aria-label="Timeframe stack">
          {tfChips.map((chip) => (
            <TfBadge key={chip.timeframe} chip={chip} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

function TfBadge({ chip }: { chip: EngineTfChip }) {
  if (!chip.revealed || !chip.direction) {
    return (
      <span className="term-analytic-tf term-analytic-tf--pending" title={`${chip.timeframe} pending`}>
        <span className="term-analytic-tf__tf">{chip.timeframe}</span>
        <span className="term-analytic-tf__dir">—</span>
      </span>
    );
  }
  const dir = chip.direction.toUpperCase();
  const tone =
    dir === 'LONG' ? 'term-analytic-tf--long' : dir === 'SHORT' ? 'term-analytic-tf--short' : 'term-analytic-tf--flat';
  const dirLetter = dir === 'LONG' ? 'L' : dir === 'SHORT' ? 'S' : '—';
  const conf = Math.round(chip.confidence ?? 0);
  return (
    <span
      className={`term-analytic-tf ${tone}`}
      title={`${chip.timeframe} ${dir} ${conf}%`}
    >
      <span className="term-analytic-tf__tf">{chip.timeframe}</span>
      <span className="term-analytic-tf__dir">{dirLetter}</span>
      <span className="term-analytic-tf__pct">{conf}</span>
    </span>
  );
}

export default AnalyticLiveHero;