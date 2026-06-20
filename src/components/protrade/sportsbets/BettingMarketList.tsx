import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  filterBettingQuestions,
  formatBettingQuestionTitle,
  questionListSubtitle,
  type BettingCategoryId,
} from '../../../lib/hyperliquid/outcomes/categories';
import { eventVisual, teamVisual } from '../../../lib/sports/teamVisuals';
import type { HlOutcomeQuestion } from '../../../lib/hyperliquid/outcomes/types';

type Props = {
  questions: HlOutcomeQuestion[];
  selectedQuestionId: number | null;
  category: BettingCategoryId;
  onSelect: (question: HlOutcomeQuestion) => void;
  loading?: boolean;
};

const BettingMarketList: React.FC<Props> = ({
  questions,
  selectedQuestionId,
  category,
  onSelect,
  loading,
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => filterBettingQuestions(questions, category, query),
    [questions, category, query]
  );

  return (
    <aside className="hl-sb-events" aria-label="Betting markets">
      <div className="hl-sb-events-head">
        <div className="hl-sb-search-wrap">
          <Search size={14} aria-hidden />
          <input
            type="search"
            className="hl-sb-search"
            placeholder="Search events, teams, macro…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="hl-sb-events-list" role="listbox">
        {loading && questions.length === 0 ? (
          <p className="hl-sb-muted">Loading markets…</p>
        ) : null}
        {!loading && filtered.length === 0 ? (
          <p className="hl-sb-muted">No markets in this category. Try All or another filter.</p>
        ) : null}
        {filtered.map((question) => {
          const active = question.questionId === selectedQuestionId;
          const visuals = eventVisual(formatBettingQuestionTitle(question), question.category);
          const previewLeg = question.legs[0];
          const legVisual = previewLeg ? teamVisual(previewLeg.name) : null;

          return (
            <button
              key={question.questionId}
              type="button"
              role="option"
              aria-selected={active}
              className={`hl-sb-event ${active ? 'hl-sb-event--active' : ''}`}
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
                  </span>
                  <span className="hl-sb-event-meta">{questionListSubtitle(question)}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

export default BettingMarketList;
