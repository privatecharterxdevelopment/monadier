import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { OUTCOME_BOOK_POLL_MS } from '../../../lib/hyperliquid/outcomes/constants';
import { fetchOutcomeLegQuote, type OutcomeLegQuote } from '../../../lib/hyperliquid/outcomes';
import { ensureArray } from '../../../lib/ensureArray';
import { findOutcomeMarket } from '../../../lib/hyperliquid/outcomes/meta';
import { useSportsbetsSession } from '../../../hooks/useSportsbetsSession';
import BettingMarketList from './BettingMarketList';
import SportsbetsEventDetail from './SportsbetsEventDetail';
import SportsbetsOrderPanel from './SportsbetsOrderPanel';
import SportsbetsPositions from './SportsbetsPositions';

type Props = {
  walletAddress?: string;
  walletConnected: boolean;
  userId?: string;
};

const SportsbetsTerminal: React.FC<Props> = ({ walletAddress, walletConnected, userId }) => {
  const session = useSportsbetsSession(walletAddress, true, userId);
  const [legQuotes, setLegQuotes] = useState<Record<number, OutcomeLegQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);

  const selectedMarket = useMemo(() => {
    if (!session.catalog || session.selectedOutcomeId == null) return null;
    return findOutcomeMarket(session.catalog, session.selectedOutcomeId) ?? null;
  }, [session.catalog, session.selectedOutcomeId]);

  const positionSize = useMemo(() => {
    if (session.selectedOutcomeId == null) return 0;
    const row = session.positions.find(
      (p) => p.outcomeId === session.selectedOutcomeId && p.side === session.selectedSide
    );
    return row?.size ?? 0;
  }, [session.positions, session.selectedOutcomeId, session.selectedSide]);

  useEffect(() => {
    const question = session.selectedQuestion;
    if (!question) {
      setLegQuotes({});
      return;
    }

    let cancelled = false;

    const pullQuotes = async (background: boolean) => {
      if (!background) setQuotesLoading(true);
      try {
        const rows = await Promise.all(
          ensureArray(question.legs).map(async (leg) => {
            const quote = await fetchOutcomeLegQuote(leg.outcomeId, leg.name);
            return [leg.outcomeId, quote] as const;
          })
        );
        if (cancelled) return;
        const next: Record<number, OutcomeLegQuote> = {};
        for (const [id, quote] of rows) next[id] = quote;
        setLegQuotes(next);
      } catch {
        if (!cancelled && !background) setLegQuotes({});
      } finally {
        if (!cancelled && !background) setQuotesLoading(false);
      }
    };

    void pullQuotes(false);

    const poll = window.setInterval(() => {
      void pullQuotes(true);
    }, OUTCOME_BOOK_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [session.selectedQuestion]);

  const handleCancelOrder = async (outcomeId: number, side: 0 | 1, oid: number) => {
    await session.trading.cancelOutcomeOrder(outcomeId, side, oid);
    await session.refreshAll();
  };

  return (
    <div className="hl-sb-terminal">
      <div className="hl-sb-toolbar">
        <div>
          <h1 className="hl-sb-toolbar-title">Betting</h1>
          <p className="hl-sb-toolbar-sub">
            Sports, crypto &amp; macro — search and switch markets live
          </p>
        </div>
        <div className="hl-sb-toolbar-actions">
          <span className="hl-sb-live" title="Markets sync automatically from Hyperliquid">
            <span className={`hl-sb-live-dot ${session.catalogSyncing ? 'hl-sb-live-dot--sync' : ''}`} />
            Live · {session.questions.length} markets
          </span>
          <button
            type="button"
            className="hl-sb-refresh"
            onClick={() => void session.refreshAll()}
            disabled={session.catalogLoading && session.questions.length === 0}
          >
            {session.catalogSyncing || session.catalogLoading ? (
              <Loader2 size={14} className="hl-spin" aria-hidden />
            ) : (
              <RefreshCw size={14} aria-hidden />
            )}
            Refresh
          </button>
        </div>
      </div>

      {session.catalogError ? (
        <div className="hl-sb-alert" role="alert">
          {session.catalogError}
        </div>
      ) : null}

      <div className="hl-sb-body">
        <BettingMarketList
          questions={session.questions}
          selectedQuestionId={session.selectedQuestionId}
          category={session.category}
          onCategoryChange={session.setCategory}
          onSelect={session.selectQuestion}
          loading={session.catalogLoading}
        />

        <div className="hl-sb-main">
          {session.selectedQuestion ? (
            <SportsbetsEventDetail
              question={session.selectedQuestion}
              legQuotes={legQuotes}
              quotesLoading={quotesLoading}
              selectedOutcomeId={session.selectedOutcomeId}
              selectedSide={session.selectedSide}
              onSelectLeg={session.selectLeg}
            />
          ) : (
            <div className="hl-sb-empty-main">
              {session.catalogLoading ? (
                <p className="hl-sb-muted">
                  <Loader2 size={18} className="hl-spin" aria-hidden /> Loading markets…
                </p>
              ) : (
                <p className="hl-sb-muted">Pick a category or search to start betting.</p>
              )}
            </div>
          )}

          <SportsbetsOrderPanel
            market={selectedMarket}
            side={session.selectedSide}
            quote={session.quote}
            quoteLoading={session.quoteLoading}
            bettingBalance={session.bettingBalance}
            walletConnected={walletConnected}
            trading={session.trading}
            positionSize={positionSize}
            onSuccess={() => void session.refreshAll()}
          />
        </div>
      </div>

      <SportsbetsPositions
        positions={session.positions}
        openOrders={session.outcomeOpenOrders}
        fills={session.outcomeFills}
        loading={session.positionsLoading || session.accountLoading}
        onCancelOrder={(outcomeId, side, oid) => void handleCancelOrder(outcomeId, side, oid)}
        cancelBusy={session.trading.busy}
      />
    </div>
  );
};

export default SportsbetsTerminal;
