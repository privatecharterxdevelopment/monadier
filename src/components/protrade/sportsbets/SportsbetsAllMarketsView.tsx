import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BETTING_CATEGORY_TABS,
  categoryLabel,
  formatBettingQuestionTitle,
  orderQuestionsForAllView,
  questionListSubtitle,
  resolveBettingCategory,
} from '../../../lib/hyperliquid/outcomes/categories';
import type { HlOutcomeQuestion, OutcomeLegQuote, OutcomeSideIndex } from '../../../lib/hyperliquid/outcomes/types';
import SportsbetsMarketTable from './SportsbetsMarketTable';

type Props = {
  questions: HlOutcomeQuestion[];
  legQuotes: Record<number, OutcomeLegQuote | undefined>;
  quotesLoading: boolean;
  selectedQuestionId: number | null;
  selectedOutcomeId: number | null;
  selectedSide: OutcomeSideIndex;
  onSelectLeg: (question: HlOutcomeQuestion, outcomeId: number, side: OutcomeSideIndex) => void;
};

const SportsbetsAllMarketsView: React.FC<Props> = ({
  questions,
  legQuotes,
  quotesLoading,
  selectedQuestionId,
  selectedOutcomeId,
  selectedSide,
  onSelectLeg,
}) => {
  const { t } = useTranslation();
  const ordered = useMemo(() => orderQuestionsForAllView(questions), [questions]);

  return (
    <section className="hl-sb-detail hl-sb-all-markets">
      <div className="hl-sb-detail-head hl-sb-detail-head--all">
        <h2 className="hl-sb-detail-title">{t('betting.allMarkets')}</h2>
        <p className="hl-sb-detail-summary">{t('betting.allMarketsLead')}</p>
      </div>

      <div className="hl-sb-all-markets-scroll">
        {ordered.map((question) => {
          const cat = resolveBettingCategory(question);
          const activeBlock = question.questionId === selectedQuestionId;
          const catTab = BETTING_CATEGORY_TABS.find((tab) => tab.id === cat);
          const catDisplay = catTab ? t(catTab.labelKey) : categoryLabel(cat);

          return (
            <article
              key={question.questionId}
              id={`sb-market-${question.questionId}`}
              className={`hl-sb-all-market-block ${activeBlock ? 'hl-sb-all-market-block--active' : ''}`}
            >
              <header className="hl-sb-all-market-head">
                <div>
                  <h3 className="hl-sb-all-market-title">{formatBettingQuestionTitle(question)}</h3>
                  <p className="hl-sb-all-market-meta">{questionListSubtitle(question)}</p>
                </div>
                <span className="hl-sb-all-market-cat">{catDisplay}</span>
              </header>

              <SportsbetsMarketTable
                question={question}
                legQuotes={legQuotes}
                quotesLoading={quotesLoading}
                selectedOutcomeId={selectedOutcomeId}
                selectedSide={selectedSide}
                onSelectLeg={(outcomeId, side) => onSelectLeg(question, outcomeId, side)}
                compact
              />
            </article>
          );
        })}
      </div>

      <p className="hl-sb-footnote">
        List prices are mid estimates (~). The bet slip uses the live buy price (ask) for your selection.
      </p>
    </section>
  );
};

export default SportsbetsAllMarketsView;
