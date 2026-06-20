import React, { useMemo } from 'react';
import { outcomeListDisplayPx } from '../../../lib/hyperliquid/outcomes/book';
import {
  formatDecimalOdds,
  formatOutcomeBetCell,
  formatOutcomeImpliedPct,
  isIndicativeOutcomeQuote,
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
import { resolveEventBanner } from '../../../lib/sports/eventBanner';
import { eventVisual } from '../../../lib/sports/teamVisuals';
import type { HlOutcomeQuestion, OutcomeLegQuote, OutcomeSideIndex } from '../../../lib/hyperliquid/outcomes/types';
import TeamBadge from './TeamBadge';
import SportsbetsEventBanner from './SportsbetsEventBanner';

type Props = {
  question: HlOutcomeQuestion;
  legQuotes: Record<number, OutcomeLegQuote | undefined>;
  quotesLoading: boolean;
  selectedOutcomeId: number | null;
  selectedSide: OutcomeSideIndex;
  onSelectLeg: (outcomeId: number, side: OutcomeSideIndex) => void;
};

function legDisplayPrice(quote: OutcomeLegQuote | undefined, side: 0 | 1): number {
  if (!quote) return 0;
  const book = side === 0 ? quote.yes : quote.no;
  return outcomeListDisplayPx(book);
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
  const banner = useMemo(
    () => resolveEventBanner(question, title, category),
    [question, title, category]
  );

  return (
    <section className="hl-sb-detail">
      <SportsbetsEventBanner
        banner={banner}
        badge={categoryBadge}
        emoji={visuals.emoji}
        title={title}
        summary={summary}
      />

      <div className="hl-sb-market-table">
        <div className="hl-sb-market-head">
          <span>Selection</span>
          <span>Yes</span>
          <span>No</span>
        </div>

        {question.legs.map((leg) => {
          const quote = legQuotes[leg.outcomeId];
          const indicative = isIndicativeOutcomeQuote(quote);
          const yesPx = legDisplayPrice(quote, 0);
          const noPx = legDisplayPrice(quote, 1);
          const yesCell = yesPx > 0 ? formatOutcomeBetCell(yesPx, OUTCOME_PREVIEW_STAKE_USD, { indicative }) : null;
          const noCell = noPx > 0 ? formatOutcomeBetCell(noPx, OUTCOME_PREVIEW_STAKE_USD, { indicative }) : null;
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
        List prices are mid estimates (~). The bet slip uses the live buy price (ask) for your
        selection. Each contract pays $1 if it wins — profit = payout − your stake.
      </p>
    </section>
  );
};

export default SportsbetsEventDetail;
