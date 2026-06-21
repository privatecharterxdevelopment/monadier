import { fetchHlOutcomeCatalog } from '../hyperliquid/outcomes/meta';
import {
  filterBettingQuestions,
  formatCategoryBadge,
  orderQuestionsForAllView,
  resolveBettingCategory,
} from '../hyperliquid/outcomes/categories';
import {
  formatBettingQuestionSummary,
  formatBettingQuestionTitle,
} from '../hyperliquid/outcomes/priceBinaryDisplay';
import type { HlOutcomeQuestion } from '../hyperliquid/outcomes/types';

export type LandingSportsEvent = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  legs: number;
};

export type LandingPredictionStats = {
  sports: number;
  crypto: number;
  macro: number;
  other: number;
  total: number;
};

const EVENTS_TTL_MS = 30_000;
let cachedEvents: LandingSportsEvent[] | null = null;
let cachedStats: LandingPredictionStats | null = null;
let fetchedAt = 0;

function toEvent(question: HlOutcomeQuestion): LandingSportsEvent {
  return {
    id: String(question.questionId),
    title: formatBettingQuestionTitle(question),
    subtitle: formatBettingQuestionSummary(question) || formatCategoryBadge(question),
    badge: formatCategoryBadge(question),
    legs: question.legs.length,
  };
}

function pickSportsQuestions(questions: HlOutcomeQuestion[]): HlOutcomeQuestion[] {
  const sports = questions.filter((q) => resolveBettingCategory(q) === 'sports');
  return orderQuestionsForAllView(sports);
}

/** Live sports events from Hyperliquid HIP-4 outcome markets (cached ~30s). */
export async function fetchLandingSportsEvents(limit = 4): Promise<LandingSportsEvent[]> {
  if (cachedEvents && Date.now() - fetchedAt < EVENTS_TTL_MS) {
    return cachedEvents.slice(0, limit);
  }

  const catalog = await fetchHlOutcomeCatalog();
  const ordered = pickSportsQuestions(catalog.questions);
  cachedEvents = ordered.map(toEvent);
  fetchedAt = Date.now();
  return cachedEvents.slice(0, limit);
}

/** Category counts for prediction markets card. */
export async function fetchLandingPredictionStats(): Promise<LandingPredictionStats> {
  if (cachedStats && Date.now() - fetchedAt < EVENTS_TTL_MS) {
    return cachedStats;
  }

  const catalog = await fetchHlOutcomeCatalog();
  const stats: LandingPredictionStats = {
    sports: 0,
    crypto: 0,
    macro: 0,
    other: 0,
    total: catalog.questions.length,
  };

  for (const q of catalog.questions) {
    const cat = resolveBettingCategory(q);
    stats[cat] += 1;
  }

  cachedStats = stats;
  if (!cachedEvents) {
    cachedEvents = pickSportsQuestions(catalog.questions).map(toEvent);
    fetchedAt = Date.now();
  }

  return stats;
}
