import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OUTCOME_BOOK_POLL_MS } from '../../../lib/hyperliquid/outcomes/constants';
import { fetchOutcomeLegQuotesFromMids, type OutcomeLegQuote } from '../../../lib/hyperliquid/outcomes';
import { countByCategory, filterBettingQuestions } from '../../../lib/hyperliquid/outcomes/categories';
import { findOutcomeMarket } from '../../../lib/hyperliquid/outcomes/meta';
import type { HlOutcomePosition } from '../../../lib/hyperliquid/outcomes/types';
import type { OutcomeSideIndex } from '../../../lib/hyperliquid/outcomes/types';
import { useSportsbetsSession } from '../../../hooks/useSportsbetsSession';
import { useBettingFeeGate } from '../../../contexts/BettingFeeContext';
import { useBettingUi } from '../../../contexts/BettingUiContext';
import { BETTING_MOBILE_MQ, useMediaQuery } from '../../../hooks/useMediaQuery';
import SportsbetsHero from './SportsbetsHero';
import BettingMarketList from './BettingMarketList';
import SportsbetsAllMarketsView from './SportsbetsAllMarketsView';
import SportsbetsEventDetail from './SportsbetsEventDetail';
import SportsbetsRightRail from './SportsbetsRightRail';
import SportsbetsOrderPanel from './SportsbetsOrderPanel';
import SportsbetsMobileOrderSheet from './SportsbetsMobileOrderSheet';

type Props = {
  walletAddress?: string;
  walletConnected: boolean;
  signedIn: boolean;
  userId?: string;
  onRequireSignIn?: (reason: string) => void;
};

const SportsbetsTerminal: React.FC<Props> = ({
  walletAddress,
  walletConnected,
  signedIn,
  userId,
  onRequireSignIn,
}) => {
  const { t } = useTranslation();
  const { registerActions, openOrderSheet, closeOrderSheet, orderSheetOpen } = useBettingUi();
  const isMobileBetting = useMediaQuery(BETTING_MOBILE_MQ);
  const session = useSportsbetsSession(walletAddress, true, userId);
  const bettingFees = useBettingFeeGate();
  const [legQuotes, setLegQuotes] = useState<Record<number, OutcomeLegQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderAction, setOrderAction] = useState<'buy' | 'sell'>('buy');

  const categoryCounts = useMemo(
    () => countByCategory(session.questions),
    [session.questions]
  );

  const filteredQuestions = useMemo(
    () => filterBettingQuestions(session.questions, session.category, searchQuery),
    [session.questions, session.category, searchQuery]
  );

  const showAllMarketsView = session.category === 'all' && filteredQuestions.length > 0;

  const quoteLegs = useMemo(() => {
    if (showAllMarketsView) {
      return filteredQuestions.flatMap((q) =>
        q.legs.map((leg) => ({ outcomeId: leg.outcomeId, name: leg.name }))
      );
    }
    if (!session.selectedQuestion) return [];
    return session.selectedQuestion.legs.map((leg) => ({
      outcomeId: leg.outcomeId,
      name: leg.name,
    }));
  }, [showAllMarketsView, filteredQuestions, session.selectedQuestion]);

  const selectedMarket = useMemo(() => {
    if (!session.catalog || session.selectedOutcomeId == null) return null;
    return findOutcomeMarket(session.catalog, session.selectedOutcomeId) ?? null;
  }, [session.catalog, session.selectedOutcomeId]);

  const selectedQuestionForOrder = useMemo(() => {
    if (session.selectedOutcomeId == null) return null;
    if (session.selectedQuestion?.legs.some((leg) => leg.outcomeId === session.selectedOutcomeId)) {
      return session.selectedQuestion;
    }
    return (
      session.questions.find((q) => q.legs.some((leg) => leg.outcomeId === session.selectedOutcomeId)) ??
      null
    );
  }, [session.selectedQuestion, session.selectedOutcomeId, session.questions]);

  const positionSize = useMemo(() => {
    if (session.selectedOutcomeId == null) return 0;
    const row = session.positions.find(
      (p) => p.outcomeId === session.selectedOutcomeId && p.side === session.selectedSide
    );
    return row?.size ?? 0;
  }, [session.positions, session.selectedOutcomeId, session.selectedSide]);

  useEffect(() => {
    if (positionSize <= 0 && orderAction === 'sell') {
      setOrderAction('buy');
    }
  }, [positionSize, orderAction]);

  const scrollToRail = useCallback(() => {
    if (isMobileBetting) {
      openOrderSheet();
      return;
    }
    requestAnimationFrame(() => {
      document.querySelector('.hl-sb-rail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [isMobileBetting, openOrderSheet]);

  const handleSelectLeg = useCallback(
    (outcomeId: number, side: OutcomeSideIndex) => {
      session.selectLeg(outcomeId, side);
      if (isMobileBetting) openOrderSheet();
    },
    [session.selectLeg, isMobileBetting, openOrderSheet]
  );

  const handlePickQuestionLeg = useCallback(
    (
      question: (typeof session.questions)[number],
      outcomeId: number,
      side: OutcomeSideIndex
    ) => {
      session.pickQuestionLeg(question, outcomeId, side);
      if (isMobileBetting) openOrderSheet();
    },
    [session.pickQuestionLeg, isMobileBetting, openOrderSheet]
  );

  const focusPositionForCashOut = useCallback(
    (position: HlOutcomePosition) => {
      const question = session.questions.find((q) =>
        q.legs.some((leg) => leg.outcomeId === position.outcomeId)
      );
      if (question) {
        session.pickQuestionLeg(question, position.outcomeId, position.side);
      } else {
        session.selectLeg(position.outcomeId, position.side);
      }
      setOrderAction('sell');
      scrollToRail();
    },
    [session, scrollToRail]
  );

  useEffect(() => {
    registerActions({
      scrollToRail,
      cashOutFirst: session.positions[0]
        ? () => focusPositionForCashOut(session.positions[0])
        : undefined,
    });
    return () => registerActions(null);
  }, [registerActions, scrollToRail, session.positions, focusPositionForCashOut]);

  useEffect(() => {
    if (quoteLegs.length === 0) {
      setLegQuotes({});
      return;
    }

    let cancelled = false;

    const pullQuotes = async (background: boolean) => {
      if (!background) setQuotesLoading(true);
      try {
        const next = await fetchOutcomeLegQuotesFromMids(quoteLegs);
        if (cancelled) return;
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
  }, [quoteLegs]);

  const handleCancelOrder = async (outcomeId: number, side: 0 | 1, oid: number) => {
    await session.trading.cancelOutcomeOrder(outcomeId, side, oid);
    await session.refreshAll();
  };

  const handleSelectQuestion = useCallback(
    (question: (typeof session.questions)[number]) => {
      session.selectQuestion(question);
      if (isMobileBetting && question.legs[0]) {
        session.pickQuestionLeg(question, question.legs[0].outcomeId, 0);
        openOrderSheet();
        return;
      }
      if (session.category === 'all') {
        requestAnimationFrame(() => {
          document
            .getElementById(`sb-market-${question.questionId}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    },
    [session.selectQuestion, session.pickQuestionLeg, session.category, isMobileBetting, openOrderSheet]
  );

  const orderPanel = (
    <SportsbetsOrderPanel
      market={selectedMarket}
      question={selectedQuestionForOrder}
      side={session.selectedSide}
      quote={session.quote}
      quoteLoading={session.quoteLoading}
      bettingBalance={session.bettingBalance}
      walletAddress={walletAddress}
      walletConnected={walletConnected}
      signedIn={signedIn}
      onRequireSignIn={onRequireSignIn}
      trading={session.trading}
      positionSize={positionSize}
      onSuccess={async () => {
        await session.refreshAll();
        const feeStatus = await bettingFees.refresh();
        if (feeStatus?.bettingBlocked) {
          bettingFees.openPayModal();
        }
        if (isMobileBetting) closeOrderSheet();
      }}
      orderAction={orderAction}
      onOrderActionChange={setOrderAction}
    />
  );

  return (
    <div className="hl-sb-terminal">
      <SportsbetsHero
        syncing={session.catalogSyncing}
        onRefresh={() => void session.refreshAll()}
        refreshDisabled={session.catalogLoading && session.questions.length === 0}
        category={session.category}
        categoryCounts={categoryCounts}
        onCategoryChange={session.setCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

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
          searchQuery={searchQuery}
          onSelect={handleSelectQuestion}
          loading={session.catalogLoading}
        />

        <div className="hl-sb-center">
          {showAllMarketsView ? (
            <SportsbetsAllMarketsView
              questions={filteredQuestions}
              legQuotes={legQuotes}
              quotesLoading={quotesLoading}
              selectedQuestionId={session.selectedQuestionId}
              selectedOutcomeId={session.selectedOutcomeId}
              selectedSide={session.selectedSide}
              onSelectLeg={handlePickQuestionLeg}
            />
          ) : session.selectedQuestion ? (
            <SportsbetsEventDetail
              question={session.selectedQuestion}
              legQuotes={legQuotes}
              quotesLoading={quotesLoading}
              selectedOutcomeId={session.selectedOutcomeId}
              selectedSide={session.selectedSide}
              onSelectLeg={handleSelectLeg}
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
        </div>

        <SportsbetsRightRail
          hideOrderPanel={isMobileBetting}
          market={selectedMarket}
          question={selectedQuestionForOrder}
          side={session.selectedSide}
          quote={session.quote}
          quoteLoading={session.quoteLoading}
          bettingBalance={session.bettingBalance}
          walletAddress={walletAddress}
          walletConnected={walletConnected}
          signedIn={signedIn}
          onRequireSignIn={onRequireSignIn}
          trading={session.trading}
          positionSize={positionSize}
          positions={session.positions}
          openOrders={session.outcomeOpenOrders}
          fills={session.outcomeFills}
          positionsLoading={session.positionsLoading || session.accountLoading}
          onSuccess={() => void session.refreshAll()}
          onCancelOrder={(outcomeId, side, oid) => void handleCancelOrder(outcomeId, side, oid)}
          orderAction={orderAction}
          onOrderActionChange={setOrderAction}
          onCashOutPosition={focusPositionForCashOut}
          orderPanel={!isMobileBetting ? orderPanel : undefined}
        />
      </div>

      {isMobileBetting ? (
        <SportsbetsMobileOrderSheet
          open={orderSheetOpen && session.selectedOutcomeId != null}
          onClose={closeOrderSheet}
          title={selectedMarket ? t('betting.placeBet') : t('betting.betSlip')}
        >
          {orderPanel}
        </SportsbetsMobileOrderSheet>
      ) : null}
    </div>
  );
};

export default SportsbetsTerminal;
