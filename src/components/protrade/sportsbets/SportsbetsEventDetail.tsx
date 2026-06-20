import React, { useMemo } from 'react';
import {
  formatDecimalOdds,
  formatOutcomeButtonMeta,
  formatOutcomeImpliedPct,
  formatOutcomePriceCents,
} from '../../../lib/hyperliquid/outcomes/display';
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

function legMidYes(quote: OutcomeLegQuote | undefined): number {
  if (!quote) return 0;
  return quote.yes.mid > 0 ? quote.yes.mid : quote.yes.bestAsk;
}

function legMidNo(quote: OutcomeLegQuote | undefined): number {
  if (!quote) return 0;
  return quote.no.mid > 0 ? quote.no.mid : quote.no.bestAsk;
}

const SportsbetsEventDetail: React.FC<Props> = ({
  question,
  legQuotes,
  quotesLoading,
  selectedOutcomeId,
  selectedSide,
  onSelectLeg,
}) => {
  const description = typeof question.description === 'string' ? question.description : '';

  const summary = useMemo(() => {
    if (!description) return '';
    const firstLine = description.split('\n')[0]?.trim();
    if (firstLine && firstLine.length < 220) return firstLine;
    return description.slice(0, 220).trim() + (description.length > 220 ? '…' : '');
  }, [description]);

  const category = resolveBettingCategory(question);
  const visuals = useMemo(() => eventVisual(question.name, category), [question.name, category]);
  const categoryBadge = useMemo(() => formatCategoryBadge(question), [question]);

  return (
    <section className="hl-sb-detail">
      <header className="hl-sb-match-banner">
        <div className="hl-sb-match-banner-bg" aria-hidden />
        <div className="hl-sb-match-banner-content">
          <div className="hl-sb-match-banner-top">
            <span className="hl-sb-detail-badge hl-sb-detail-badge--banner">{categoryBadge}</span>
            <span className="hl-sb-match-banner-live">Live market</span>
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
            <h2 className="hl-sb-detail-title">{question.name}</h2>
          </div>
          {summary ? <p className="hl-sb-detail-desc">{summary}</p> : null}
        </div>
      </header>

      <div className="hl-sb-legs">
        <div className="hl-sb-legs-head">
          <span>Selection</span>
          <span>Yes · odds</span>
          <span>No · odds</span>
        </div>

        {question.legs.map((leg) => {
          const quote = legQuotes[leg.outcomeId];
          const yesPx = quote?.yes.bestAsk ?? 0;
          const noPx = quote?.no.bestAsk ?? 0;
          const yesMid = legMidYes(quote);
          const noMid = legMidNo(quote);
          const yesMeta = yesPx > 0 ? formatOutcomeButtonMeta(yesPx) : null;
          const noMeta = noPx > 0 ? formatOutcomeButtonMeta(noPx) : null;
          const yesSelected = selectedOutcomeId === leg.outcomeId && selectedSide === 0;
          const noSelected = selectedOutcomeId === leg.outcomeId && selectedSide === 1;

          return (
            <div key={leg.outcomeId} className="hl-sb-leg-row">
              <div className="hl-sb-leg-name">
                <span className="hl-sb-leg-name-row">
                  <TeamBadge name={leg.name} size={28} />
                  <strong>{leg.name}</strong>
                </span>
                {quote && yesMid > 0 ? (
                  <span className="hl-sb-leg-implied">
                    Implied {formatOutcomeImpliedPct(yesMid)} · {formatDecimalOdds(yesMid)}×
                  </span>
                ) : quotesLoading ? (
                  <span className="hl-sb-leg-implied">Loading odds…</span>
                ) : (
                  <span className="hl-sb-leg-implied">No liquidity yet</span>
                )}
              </div>
              <button
                type="button"
                className={`hl-sb-side-btn hl-sb-side-btn--yes ${yesSelected ? 'hl-sb-side-btn--active' : ''}`}
                onClick={() => onSelectLeg(leg.outcomeId, 0)}
              >
                <span className="hl-sb-side-label">{leg.yesLabel}</span>
                <span className="hl-sb-side-odds">{yesMeta ? yesMeta.odds : '—'}</span>
                <span className="hl-sb-side-price">
                  {yesPx > 0 ? `@ ${formatOutcomePriceCents(yesPx)}` : '—'}
                </span>
                {yesMeta ? (
                  <span className="hl-sb-side-hint">{yesMeta.implied} implied</span>
                ) : null}
              </button>
              <button
                type="button"
                className={`hl-sb-side-btn hl-sb-side-btn--no ${noSelected ? 'hl-sb-side-btn--active' : ''}`}
                onClick={() => onSelectLeg(leg.outcomeId, 1)}
              >
                <span className="hl-sb-side-label">{leg.noLabel}</span>
                <span className="hl-sb-side-odds">{noMeta ? noMeta.odds : '—'}</span>
                <span className="hl-sb-side-price">
                  {noPx > 0 ? `@ ${formatOutcomePriceCents(noPx)}` : '—'}
                </span>
                {noMeta ? (
                  <span className="hl-sb-side-hint">{noMeta.implied} implied</span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>

      <p className="hl-sb-footnote">
        Odds are decimal (payout per $1 staked). Price is per contract in cents — each winning
        contract pays $1 USDC. Enter your stake in Bet &amp; win for an exact payout estimate.
      </p>
    </section>
  );
};

export default SportsbetsEventDetail;
