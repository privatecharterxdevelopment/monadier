import React, { useMemo } from 'react';
import {
  formatDecimalOdds,
  formatOutcomeBetCell,
  formatOutcomeImpliedPct,
  OUTCOME_PREVIEW_STAKE_USD,
} from '../../../lib/hyperliquid/outcomes/display';
import {
  formatBettingLegName,
  formatBettingQuestionSummary,
  formatBettingQuestionTitle,
  formatCategoryBadge,
  resolveBettingCategory,
} from '../../../lib/hyperliquid/outcomes/categories';
import { parsePriceBinaryMeta } from '../../../lib/hyperliquid/outcomes/priceBinaryDisplay';
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

function legPrice(quote: OutcomeLegQuote | undefined, side: 0 | 1): number {
  if (!quote) return 0;
  const book = side === 0 ? quote.yes : quote.no;
  return book.mid > 0 ? book.mid : book.bestAsk;
}

const SportsbetsEventDetail: React.FC<Props> = ({
  question,
  legQuotes,
  quotesLoading,
  selectedOutcomeId,
  selectedSide,
  onSelectLeg,
}) => {
  const title = useMemo(() => formatBettingQuestionTitle(question), [question]);
  const summary = useMemo(() => formatBettingQuestionSummary(question), [question]);
  const category = resolveBettingCategory(question);
  const visuals = useMemo(() => eventVisual(title, category), [title, category]);
  const categoryBadge = useMemo(() => formatCategoryBadge(question), [question]);

  return (
    <section className="hl-sb-detail">
      <header className="hl-sb-panel hl-sb-panel--event">
        <div className="hl-sb-panel-row">
          <span className="hl-sb-detail-badge">{categoryBadge}</span>
          <span className="hl-sb-muted">Live · mid prices</span>
        </div>
        <div className="hl-sb-detail-title-row">
            <span className="hl-sb-event-icon hl-sb-event-icon--lg" aria-hidden>
              {visuals.emoji}
            </span>
            {visuals.flagUrls.length >= 2 ? (
              <div className="hl-sb-match-flags hl-sb-match-flags--banner">
                <img src={visuals.flagUrls[0]} alt="" width={40} height={30} loading="lazy" />
                <span className="hl-sb-match-vs">vs</span>
                <img src={visuals.flagUrls[1]} alt="" width={40} height={30} loading="lazy" />
              </div>
            ) : null}
            <h2 className="hl-sb-detail-title">{title}</h2>
          </div>
          {summary ? <p className="hl-sb-detail-desc">{summary}</p> : null}
      </header>

      <div className="hl-sb-market-table">
        <div className="hl-sb-market-head">
          <span>Selection</span>
          <span>Yes</span>
          <span>No</span>
        </div>

        {question.legs.map((leg) => {
          const quote = legQuotes[leg.outcomeId];
          const yesPx = legPrice(quote, 0);
          const noPx = legPrice(quote, 1);
          const yesCell = yesPx > 0 ? formatOutcomeBetCell(yesPx) : null;
          const noCell = noPx > 0 ? formatOutcomeBetCell(noPx) : null;
          const yesSelected = selectedOutcomeId === leg.outcomeId && selectedSide === 0;
          const noSelected = selectedOutcomeId === leg.outcomeId && selectedSide === 1;
          const implied =
            yesPx > 0
              ? `${formatOutcomeImpliedPct(yesPx)} · ${formatDecimalOdds(yesPx)}×`
              : quotesLoading
                ? 'Loading…'
                : '—';

          const legLabel = formatBettingLegName(leg);
          const legBadge = parsePriceBinaryMeta(leg.description)?.underlying ?? leg.name;

          return (
            <div key={leg.outcomeId} className="hl-sb-market-row">
              <div className="hl-sb-market-team">
                <TeamBadge name={legBadge} size={32} />
                <div className="hl-sb-market-team-copy">
                  <strong>{legLabel}</strong>
                  <span className="hl-sb-leg-implied">{implied}</span>
                </div>
              </div>

              <button
                type="button"
                className={`hl-sb-odds-cell hl-sb-odds-cell--yes ${yesSelected ? 'hl-sb-odds-cell--picked' : ''}`}
                onClick={() => onSelectLeg(leg.outcomeId, 0)}
              >
                {yesCell ? (
                  <>
                    <span className="hl-sb-odds-val">{yesCell.odds}</span>
                    <span className="hl-sb-odds-win">{yesCell.winLine}</span>
                  </>
                ) : (
                  <span className="hl-sb-odds-val">—</span>
                )}
              </button>

              <button
                type="button"
                className={`hl-sb-odds-cell hl-sb-odds-cell--no ${noSelected ? 'hl-sb-odds-cell--picked' : ''}`}
                onClick={() => onSelectLeg(leg.outcomeId, 1)}
              >
                {noCell ? (
                  <>
                    <span className="hl-sb-odds-val">{noCell.odds}</span>
                    <span className="hl-sb-odds-win">{noCell.winLine}</span>
                  </>
                ) : (
                  <span className="hl-sb-odds-val">—</span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="hl-sb-footnote">
        Decimal odds (European). Preview uses a ${OUTCOME_PREVIEW_STAKE_USD} stake — each contract pays
        $1 if the outcome wins. Enter your stake in the bet slip on the right.
      </p>
    </section>
  );
};

export default SportsbetsEventDetail;
