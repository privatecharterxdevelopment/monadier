import React, { useMemo } from 'react';
import {
  formatBettingQuestionSummary,
  formatBettingQuestionTitle,
} from '../../../lib/hyperliquid/outcomes/categories';
import type { HlOutcomeQuestion, OutcomeLegQuote, OutcomeSideIndex } from '../../../lib/hyperliquid/outcomes/types';
import SportsbetsMarketTable from './SportsbetsMarketTable';

type Props = {
  question: HlOutcomeQuestion;
  legQuotes: Record<number, OutcomeLegQuote | undefined>;
  quotesLoading: boolean;
  selectedOutcomeId: number | null;
  selectedSide: OutcomeSideIndex;
  onSelectLeg: (outcomeId: number, side: OutcomeSideIndex) => void;
};

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

  return (
    <section className="hl-sb-detail">
      <div className="hl-sb-detail-head">
        <h2 className="hl-sb-detail-title">{title}</h2>
        {summary ? <p className="hl-sb-detail-summary">{summary}</p> : null}
      </div>

      <SportsbetsMarketTable
        question={question}
        legQuotes={legQuotes}
        quotesLoading={quotesLoading}
        selectedOutcomeId={selectedOutcomeId}
        selectedSide={selectedSide}
        onSelectLeg={onSelectLeg}
      />

      <p className="hl-sb-footnote">
        List prices are mid estimates (~). The bet slip uses the live buy price (ask) for your
        selection. Each contract pays $1 if it wins — profit = payout − your stake.
      </p>
    </section>
  );
};

export default SportsbetsEventDetail;
