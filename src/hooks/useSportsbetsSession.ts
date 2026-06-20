import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHyperliquidAccount } from './useHyperliquidAccount';
import { useHyperliquidOutcomes } from './useHyperliquidOutcomes';
import {
  useHyperliquidOutcomeMarket,
  useHyperliquidOutcomeTrading,
} from './useHyperliquidOutcomeTrading';
import { fetchHlOutcomePositions } from '../lib/hyperliquid/outcomes';
import { OUTCOME_POSITIONS_POLL_MS } from '../lib/hyperliquid/outcomes/constants';
import { syncBettingTradesToSupabase } from '../lib/betting/syncBettingTrades';
import {
  filterBettingQuestions,
  type BettingCategoryId,
} from '../lib/hyperliquid/outcomes/categories';
import { isOutcomeOrderCoin, parseOutcomeOrderCoin } from '../lib/hyperliquid/outcomes/encoding';
import type { HlOutcomePosition, HlOutcomeQuestion, OutcomeSideIndex } from '../lib/hyperliquid/outcomes/types';

export function useSportsbetsSession(walletAddress?: string, enabled = true, userId?: string) {
  const {
    catalog,
    questions,
    loading: catalogLoading,
    syncing: catalogSyncing,
    error: catalogError,
    updatedAt: catalogUpdatedAt,
    refresh: refreshCatalog,
  } = useHyperliquidOutcomes(enabled);

  const [category, setCategory] = useState<BettingCategoryId>('all');
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<number | null>(null);
  const [selectedSide, setSelectedSide] = useState<OutcomeSideIndex>(0);
  const [positions, setPositions] = useState<HlOutcomePosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);

  const categoryQuestions = useMemo(
    () => filterBettingQuestions(questions, category, ''),
    [questions, category]
  );

  const {
    spotBalances,
    openOrders,
    fills,
    loading: accountLoading,
    refresh: refreshAccount,
  } = useHyperliquidAccount(walletAddress);

  const { quote, loading: quoteLoading, refresh: refreshQuote } = useHyperliquidOutcomeMarket(
    selectedOutcomeId,
    enabled && selectedOutcomeId != null
  );

  const trading = useHyperliquidOutcomeTrading();

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.questionId === selectedQuestionId) ?? null,
    [questions, selectedQuestionId]
  );

  useEffect(() => {
    if (!enabled || categoryQuestions.length === 0) return;
    if (
      selectedQuestionId != null &&
      categoryQuestions.some((q) => q.questionId === selectedQuestionId)
    ) {
      return;
    }
    setSelectedQuestionId(categoryQuestions[0]?.questionId ?? null);
  }, [enabled, categoryQuestions, selectedQuestionId]);

  useEffect(() => {
    if (!selectedQuestion) {
      setSelectedOutcomeId(null);
      return;
    }
    const stillValid = selectedQuestion.legs.some((leg) => leg.outcomeId === selectedOutcomeId);
    if (!stillValid) {
      setSelectedOutcomeId(selectedQuestion.legs[0]?.outcomeId ?? null);
      setSelectedSide(0);
    }
  }, [selectedQuestion, selectedOutcomeId]);

  const outcomeOpenOrders = useMemo(
    () =>
      openOrders.filter((o) => {
        if (!isOutcomeOrderCoin(o.coin)) return false;
        const parsed = parseOutcomeOrderCoin(o.coin);
        if (!parsed) return false;
        return catalog?.outcomeById.has(parsed.outcomeId) ?? true;
      }),
    [openOrders, catalog]
  );

  const outcomeFills = useMemo(
    () => fills.filter((f) => isOutcomeOrderCoin(f.coin)),
    [fills]
  );

  const refreshPositions = useCallback(async () => {
    if (!walletAddress || !catalog) {
      setPositions([]);
      return;
    }
    setPositionsLoading(true);
    try {
      const rows = await fetchHlOutcomePositions(walletAddress, catalog);
      setPositions(rows);
    } catch {
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  }, [walletAddress, catalog]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshCatalog({ force: true }),
      refreshAccount(),
      refreshQuote(),
      refreshPositions(),
    ]);
    if (userId && walletAddress && catalog) {
      void syncBettingTradesToSupabase(userId, walletAddress, catalog);
    }
  }, [refreshCatalog, refreshAccount, refreshQuote, refreshPositions, userId, walletAddress, catalog]);

  useEffect(() => {
    void refreshPositions();
  }, [refreshPositions]);

  useEffect(() => {
    if (!enabled || !walletAddress) return;
    const id = window.setInterval(() => void refreshPositions(), OUTCOME_POSITIONS_POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, walletAddress, refreshPositions]);

  const selectLeg = useCallback((outcomeId: number, side: OutcomeSideIndex) => {
    setSelectedOutcomeId(outcomeId);
    setSelectedSide(side);
  }, []);

  const selectQuestion = useCallback((question: HlOutcomeQuestion) => {
    setSelectedQuestionId(question.questionId);
    setSelectedOutcomeId(question.legs[0]?.outcomeId ?? null);
    setSelectedSide(0);
  }, []);

  const bettingBalance = useMemo(() => {
    const row = spotBalances.find((b) => b.coin === 'USDC');
    return row ? Number(row.total) : 0;
  }, [spotBalances]);

  return {
    catalog,
    questions,
    category,
    setCategory,
    categoryQuestions,
    catalogLoading,
    catalogSyncing,
    catalogError,
    catalogUpdatedAt,
    selectedQuestion,
    selectedQuestionId,
    selectedOutcomeId,
    selectedSide,
    selectQuestion,
    selectLeg,
    quote,
    quoteLoading,
    trading,
    positions,
    positionsLoading,
    outcomeOpenOrders,
    outcomeFills,
    bettingBalance,
    accountLoading,
    refreshAll,
  };
}
