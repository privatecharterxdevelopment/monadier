import React, { useMemo } from 'react';
import {
  filterBettingQuestions,
  formatBettingQuestionTitle,
  isFeaturedBettingQuestion,
  questionListSubtitle,
  splitFeaturedBettingQuestions,
  type BettingCategoryId,
} from '../../../lib/hyperliquid/outcomes/categories';
import { eventVisual, teamVisual } from '../../../lib/sports/teamVisuals';
import type { HlOutcomeQuestion } from '../../../lib/hyperliquid/outcomes/types';

type Props = {
  questions: HlOutcomeQuestion[];
  selectedQuestionId: number | null;
  category: BettingCategoryId;
  searchQuery: string;
  onSelect: (question: HlOutcomeQuestion) => void;
  loading?: boolean;
};

function MarketRow({
  question,
  active,
  featured,
  onSelect,
}: {
  question: HlOutcomeQuestion;
  active: boolean;
  featured?: boolean;
  onSelect: (question: HlOutcomeQuestion) => void;
}) {
  const visuals = eventVisual(formatBettingQuestionTitle(question), question.category);
  const previewLeg = question.legs[0];
  const legVisual = previewLeg ? teamVisual(previewLeg.name) : null;

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={`hl-sb-event ${active ? 'hl-sb-event--active' : ''} ${featured ? 'hl-sb-event--featured' : ''}`}
      onClick={() => onSelect(question)}
    >
      <span className="hl-sb-event-row">
        <span className="hl-sb-event-thumb" aria-hidden>
          {legVisual?.flagUrl ? (
            <img src={legVisual.flagUrl} alt="" width={28} height={21} loading="lazy" />
          ) : visuals.flagUrls[0] ? (
            <img src={visuals.flagUrls[0]} alt="" width={28} height={21} loading="lazy" />
          ) : (
            <span className="hl-sb-event-emoji">{visuals.emoji}</span>
          )}
        </span>
        <span className="hl-sb-event-copy">
          <span className="hl-sb-event-name">
            <span className="hl-sb-event-name-text">{formatBettingQuestionTitle(question)}</span>
            {featured ? <span className="hl-sb-event-pin">Featured</span> : null}
          </span>
          <span className="hl-sb-event-meta">{questionListSubtitle(question)}</span>
        </span>
      </span>
    </button>
  );
}

const BettingMarketList: React.FC<Props> = ({
  questions,
  selectedQuestionId,
  category,
  searchQuery,
  onSelect,
  loading,
}) => {
  const filtered = useMemo(
    () => filterBettingQuestions(questions, category, searchQuery),
    [questions, category, searchQuery]
  );

  const allSplit = useMemo(() => {
    if (category !== 'all' || searchQuery.trim()) return null;
    return splitFeaturedBettingQuestions(filtered);
  }, [category, filtered, searchQuery]);

  const showAllSections =
    category === 'all' &&
    !searchQuery.trim() &&
    allSplit != null &&
    allSplit.featured.length > 0 &&
    allSplit.others.length > 0;

  return (
    <aside className="hl-sb-events" aria-label="Betting markets">
      <div className="hl-sb-events-list" role="listbox">
        {loading && questions.length === 0 ? (
          <p className="hl-sb-muted">Loading markets…</p>
        ) : null}
        {!loading && filtered.length === 0 ? (
          <p className="hl-sb-muted">No markets in this category. Try All or another filter.</p>
        ) : null}

        {showAllSections ? (
          <>
            <p className="hl-sb-events-section">Featured</p>
            {allSplit!.featured.map((question) => (
              <MarketRow
                key={question.questionId}
                question={question}
                active={question.questionId === selectedQuestionId}
                featured
                onSelect={onSelect}
              />
            ))}
            <p className="hl-sb-events-section">All markets</p>
            {allSplit!.others.map((question) => (
              <MarketRow
                key={question.questionId}
                question={question}
                active={question.questionId === selectedQuestionId}
                onSelect={onSelect}
              />
            ))}
          </>
        ) : (
          filtered.map((question) => (
            <MarketRow
              key={question.questionId}
              question={question}
              active={question.questionId === selectedQuestionId}
              featured={category === 'all' && isFeaturedBettingQuestion(question)}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
};

export default BettingMarketList;
