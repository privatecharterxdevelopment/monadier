import React, { useMemo } from 'react';
import { fmtPct } from '../../../lib/hyperliquid/format';
import { previewOutcomeBuy, formatProfitUsd } from '../../../lib/hyperliquid/outcomes/payout';
import {
  formatCategoryBadge,
  resolveBettingCategory,
} from '../../../lib/hyperliquid/outcomes/categories';
import { eventVisual } from '../../../lib/sports/teamVisuals';
import type { HlOutcomeQuestion, OutcomeLegQuote, OutcomeSideIndex } from '../../../lib/hyperliquid/outcomes/types';
import TeamBadge from './TeamBadge';

type Props = {
  question: HlOutcomeQuestion;
  legQuotes: Record<number, OutcomeLegQuote | undefined>;
  quotesLoading: boolean;
  selectedOutcomeId: number | null;
  selectedSide: OutcomeSideIndex;
  onSelectLeg: (outcomeId: number, side: OutcomeSideIndex) => void;
};

function fmtProb(value: number): string {
  if (value <= 0) return '—';
  return `${(value * 100).toFixed(1)}¢`;
}

const SportsbetsEventDetail: React.FC<Props> = ({
  question,
  legQuotes,
  quotesLoading,
  selectedOutcomeId,
  selectedSide,
  onSelectLeg,
}) => {
  const summary = useMemo(() => {
    const firstLine = question.description.split('\n')[0]?.trim();
    if (firstLine && firstLine.length < 220) return firstLine;
    return question.description.slice(0, 220).trim() + (question.description.length > 220 ? '…' : '');
  }, [question.description]);

  const visuals = useMemo(
    () => eventVisual(question.name, resolveBettingCategory(question)),
    [question]
  );
  const categoryBadge = useMemo(() => formatCategoryBadge(question), [question]);

  return (
    <section className="hl-sb-detail">
      <header className="hl-sb-detail-head">
        <div className="hl-sb-detail-title-row">
          <span className="hl-sb-event-icon" aria-hidden>
            {visuals.emoji}
          </span>
          {visuals.flagUrls.length >= 2 ? (
            <div className="hl-sb-match-flags">
              <img src={visuals.flagUrls[0]} alt="" width={28} height={21} loading="lazy" />
              <span className="hl-sb-match-vs">vs</span>
              <img src={visuals.flagUrls[1]} alt="" width={28} height={21} loading="lazy" />
            </div>
          ) : null}
          <h2 className="hl-sb-detail-title">{question.name}</h2>
          <span className="hl-sb-detail-badge">{categoryBadge}</span>
        </div>
        <p className="hl-sb-detail-desc">{summary}</p>
      </header>

      <div className="hl-sb-legs">
        <div className="hl-sb-legs-head">
          <span>Outcome</span>
          <span>Yes · win preview</span>
          <span>No</span>
        </div>

        {question.legs.map((leg) => {
          const quote = legQuotes[leg.outcomeId];
          const yesAsk = quote?.yes.bestAsk ?? 0;
          const noAsk = quote?.no.bestAsk ?? 0;
          const yesHint = yesAsk > 0 ? previewOutcomeBuy({ stakeUsd: 100, price: yesAsk }) : null;
          const yesSelected = selectedOutcomeId === leg.outcomeId && selectedSide === 0;
          const noSelected = selectedOutcomeId === leg.outcomeId && selectedSide === 1;

          return (
            <div key={leg.outcomeId} className="hl-sb-leg-row">
              <div className="hl-sb-leg-name">
                <span className="hl-sb-leg-name-row">
                  <TeamBadge name={leg.name} />
                  <strong>{leg.name}</strong>
                </span>
                {quote ? (
                  <span className="hl-sb-leg-implied">{fmtPct(quote.impliedYesPct, 1)} chance</span>
                ) : quotesLoading ? (
                  <span className="hl-sb-leg-implied">Loading…</span>
                ) : null}
              </div>
              <button
                type="button"
                className={`hl-sb-side-btn hl-sb-side-btn--yes ${yesSelected ? 'hl-sb-side-btn--active' : ''}`}
                onClick={() => onSelectLeg(leg.outcomeId, 0)}
              >
                <span className="hl-sb-side-label">{leg.yesLabel}</span>
                <span className="hl-sb-side-price">{yesAsk > 0 ? fmtProb(yesAsk) : '—'}</span>
                {yesHint ? (
                  <span className="hl-sb-side-hint">
                    $100 → {formatProfitUsd(yesHint.profitIfWin)}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={`hl-sb-side-btn hl-sb-side-btn--no ${noSelected ? 'hl-sb-side-btn--active' : ''}`}
                onClick={() => onSelectLeg(leg.outcomeId, 1)}
              >
                <span className="hl-sb-side-label">{leg.noLabel}</span>
                <span className="hl-sb-side-price">{noAsk > 0 ? fmtProb(noAsk) : '—'}</span>
              </button>
            </div>
          );
        })}
      </div>

      <p className="hl-sb-footnote">
        Win preview uses ~$100 notional at the live ask. Exact payout updates in Bet &amp; win when you
        enter your stake.
      </p>
    </section>
  );
};

export default SportsbetsEventDetail;
