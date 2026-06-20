import React from 'react';
import { outcomeListDisplayPx } from '../../../lib/hyperliquid/outcomes/book';
import {
  formatOutcomeBetCellParts,
  isIndicativeOutcomeQuote,
  OUTCOME_PREVIEW_STAKE_USD,
} from '../../../lib/hyperliquid/outcomes/display';
import { formatBettingLegName } from '../../../lib/hyperliquid/outcomes/categories';
import { parsePriceBinaryMeta } from '../../../lib/hyperliquid/outcomes/priceBinaryDisplay';
import type { HlOutcomeQuestion, OutcomeLegQuote, OutcomeSideIndex } from '../../../lib/hyperliquid/outcomes/types';
import TeamBadge from './TeamBadge';
import SportsbetsOddsButton from './SportsbetsOddsButton';

type Props = {
  question: HlOutcomeQuestion;
  legQuotes: Record<number, OutcomeLegQuote | undefined>;
  quotesLoading: boolean;
  selectedOutcomeId: number | null;
  selectedSide: OutcomeSideIndex;
  onSelectLeg: (outcomeId: number, side: OutcomeSideIndex) => void;
  compact?: boolean;
};

function legDisplayPrice(quote: OutcomeLegQuote | undefined, side: 0 | 1): number {
  if (!quote) return 0;
  const book = side === 0 ? quote.yes : quote.no;
  return outcomeListDisplayPx(book);
}

const SportsbetsMarketTable: React.FC<Props> = ({
  question,
  legQuotes,
  quotesLoading,
  selectedOutcomeId,
  selectedSide,
  onSelectLeg,
  compact = false,
}) => (
  <div className={`hl-sb-market-table ${compact ? 'hl-sb-market-table--compact' : ''}`}>
    <div className="hl-sb-market-head">
      <span className="hl-sb-market-head-selection">Selection</span>
      <span className="hl-sb-market-head-odds">Yes</span>
      <span className="hl-sb-market-head-odds">No</span>
    </div>

    {question.legs.map((leg) => {
      const quote = legQuotes[leg.outcomeId];
      const indicative = isIndicativeOutcomeQuote(quote);
      const yesPx = legDisplayPrice(quote, 0);
      const noPx = legDisplayPrice(quote, 1);
      const yesParts =
        yesPx > 0 ? formatOutcomeBetCellParts(yesPx, OUTCOME_PREVIEW_STAKE_USD, { indicative }) : null;
      const noParts =
        noPx > 0 ? formatOutcomeBetCellParts(noPx, OUTCOME_PREVIEW_STAKE_USD, { indicative }) : null;
      const yesSelected = selectedOutcomeId === leg.outcomeId && selectedSide === 0;
      const noSelected = selectedOutcomeId === leg.outcomeId && selectedSide === 1;

      const legLabel = formatBettingLegName(leg);
      const legBadge = parsePriceBinaryMeta(leg.description)?.underlying ?? leg.name;

      return (
        <div key={leg.outcomeId} className="hl-sb-market-row">
          <div className="hl-sb-market-team">
            <TeamBadge name={legBadge} size={compact ? 24 : 28} />
            <div className="hl-sb-market-team-copy">
              <strong>{legLabel}</strong>
              {quotesLoading && !quote ? (
                <span className="hl-sb-leg-implied">Loading…</span>
              ) : null}
            </div>
          </div>

          <SportsbetsOddsButton
            side="Yes"
            parts={yesParts}
            picked={yesSelected}
            variant="yes"
            onClick={() => onSelectLeg(leg.outcomeId, 0)}
          />

          <SportsbetsOddsButton
            side="No"
            parts={noParts}
            picked={noSelected}
            variant="no"
            onClick={() => onSelectLeg(leg.outcomeId, 1)}
          />
        </div>
      );
    })}
  </div>
);

export default SportsbetsMarketTable;
