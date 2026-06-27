import { fetchHlOutcomeCatalog } from '../hyperliquid/outcomes/meta';
import { fetchOutcomeLegQuotesFromMids, outcomeListDisplayPx } from '../hyperliquid/outcomes/book';
import {
  filterBettingQuestions,
  formatBettingLegName,
  formatCategoryBadge,
  orderQuestionsForAllView,
  resolveBettingCategory,
  splitFeaturedBettingQuestions,
} from '../hyperliquid/outcomes/categories';
import {
  formatDecimalOdds,
  formatOutcomeImpliedPct,
  isIndicativeOutcomeQuote,
} from '../hyperliquid/outcomes/display';
import { previewOutcomeBuy } from '../hyperliquid/outcomes/payout';
import {
  formatBettingQuestionSummary,
  formatBettingQuestionTitle,
} from '../hyperliquid/outcomes/priceBinaryDisplay';
import { resolveEventBanner, type EventBannerSide, type EventBannerVariant } from '../sports/eventBanner';
import { eventVisual } from '../sports/teamVisuals';
import type { HlOutcomeMarket, HlOutcomeQuestion, OutcomeLegQuote } from '../hyperliquid/outcomes/types';

export const LANDING_BET_STAKE_USD = 25;

export type LandingBetMarket = {
  id: string;
  questionId: number;
  outcomeId: number;
  title: string;
  /** Short label for cards (team names, World Cup 2026, etc.). */
  cardTitle: string;
  cardHeadline: string;
  selection: string;
  categoryBadge: string;
  winRate: string;
  odds: string;
  payoutLabel: string;
  profitLabel: string;
  description: string;
  backgroundImage: string;
  accentColor: string;
  tagline: string | null;
  variant: EventBannerVariant;
  sideFlags: EventBannerSide[];
  emoji: string;
  isLive: boolean;
  indicative: boolean;
};

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
let cachedBetMarkets: LandingBetMarket[] | null = null;
let cachedStats: LandingPredictionStats | null = null;
let fetchedAt = 0;
let betMarketsFetchedAt = 0;

function pickLandingBetQuestions(questions: HlOutcomeQuestion[], limit: number): HlOutcomeQuestion[] {
  const { featured, others } = splitFeaturedBettingQuestions(questions);
  const merged: HlOutcomeQuestion[] = [];
  const seen = new Set<number>();

  const ordered = [...featured, ...others, ...orderQuestionsForAllView(questions)].sort((a, b) => {
    const sportsA = resolveBettingCategory(a) === 'sports' ? 0 : 1;
    const sportsB = resolveBettingCategory(b) === 'sports' ? 0 : 1;
    if (sportsA !== sportsB) return sportsA - sportsB;
    return 0;
  });

  for (const q of ordered) {
    if (seen.has(q.questionId)) continue;
    seen.add(q.questionId);
    merged.push(q);
    if (merged.length >= limit) break;
  }

  return merged;
}

function pickPrimaryLeg(
  question: HlOutcomeQuestion,
  quotes: Record<number, OutcomeLegQuote | undefined>
): { leg: HlOutcomeMarket; price: number; quote: OutcomeLegQuote | undefined } {
  let bestLeg = question.legs[0];
  let bestPrice = 0;
  let bestQuote: OutcomeLegQuote | undefined;

  for (const leg of question.legs) {
    const quote = quotes[leg.outcomeId];
    const price = quote ? outcomeListDisplayPx(quote.yes) : 0;
    if (price > bestPrice) {
      bestPrice = price;
      bestLeg = leg;
      bestQuote = quote;
    }
  }

  return { leg: bestLeg, price: bestPrice, quote: bestQuote };
}

function formatLandingBetCardDisplay(
  question: HlOutcomeQuestion,
  leg: HlOutcomeMarket,
  rawTitle: string
): { cardTitle: string; cardHeadline: string; selection: string } {
  const legName = formatBettingLegName(leg);
  const lower = rawTitle.toLowerCase();
  const pickName =
    legName === 'Yes outcome' || legName === 'Recurring' || legName === 'Fallback'
      ? 'Yes'
      : legName;

  if (lower.includes('world cup') && /champion/.test(lower)) {
    return {
      cardTitle: 'World Cup 2026',
      cardHeadline: pickName === 'Yes' ? 'Outright winner' : pickName,
      selection: pickName === 'Yes' ? 'Yes' : `Yes · ${pickName}`,
    };
  }

  const vsMatch =
    rawTitle.match(/World Cup:\s*(.+?)\s+vs\.?\s+(.+)$/i) ||
    rawTitle.match(/:\s*(.+?)\s+vs\.?\s+(.+)$/i) ||
    rawTitle.match(/^(.+?)\s+vs\.?\s+(.+)$/i);

  if (vsMatch) {
    const home = vsMatch[1].trim();
    const away = vsMatch[2].trim();
    const pick =
      pickName.toLowerCase() === home.toLowerCase()
        ? home
        : pickName.toLowerCase() === away.toLowerCase()
          ? away
          : pickName.toLowerCase() === 'draw'
            ? 'Draw'
            : pickName;
    return {
      cardTitle: `${home} vs ${away}`,
      cardHeadline: 'Match winner',
      selection: `Yes · ${pick}`,
    };
  }

  const cleaned = rawTitle.replace(/^[^:]+:\s*/, '').trim() || rawTitle;
  const cardTitle = cleaned.length > 48 ? `${cleaned.slice(0, 46).trim()}…` : cleaned;

  return {
    cardTitle,
    cardHeadline: formatCategoryBadge(question),
    selection: question.legs.length === 1 ? `Yes · ${pickName}` : `Yes · ${pickName}`,
  };
}

function toBetMarket(
  question: HlOutcomeQuestion,
  quotes: Record<number, OutcomeLegQuote | undefined>,
  stakeUsd: number
): LandingBetMarket | null {
  const { leg, price, quote } = pickPrimaryLeg(question, quotes);
  if (!leg || price <= 0) return null;

  const preview = previewOutcomeBuy({ stakeUsd, price });
  if (!preview) return null;

  const title = formatBettingQuestionTitle(question);
  const category = resolveBettingCategory(question);
  const banner = resolveEventBanner(question, title, category);
  const visuals = eventVisual(title, category);
  const card = formatLandingBetCardDisplay(question, leg, title);
  const indicative = isIndicativeOutcomeQuote(quote);
  const oddsPrefix = indicative ? '~' : '';
  const payout =
    preview.payoutIfWin >= 1000
      ? `$${Math.round(preview.payoutIfWin).toLocaleString()}`
      : `$${preview.payoutIfWin.toFixed(2)}`;
  const profit =
    preview.profitIfWin >= 0
      ? `+$${preview.profitIfWin.toFixed(2)}`
      : `-$${Math.abs(preview.profitIfWin).toFixed(2)}`;

  return {
    id: `${question.questionId}-${leg.outcomeId}`,
    questionId: question.questionId,
    outcomeId: leg.outcomeId,
    title,
    cardTitle: card.cardTitle,
    cardHeadline: card.cardHeadline,
    selection: card.selection,
    categoryBadge: formatCategoryBadge(question),
    winRate: formatOutcomeImpliedPct(price),
    odds: `${oddsPrefix}${formatDecimalOdds(price)}×`,
    payoutLabel: payout,
    profitLabel: profit,
    description:
      formatBettingQuestionSummary(question) ||
      `$${stakeUsd} on Yes — ${payout} return (${profit} profit) if it wins.`,
    backgroundImage: banner.backgroundImage,
    accentColor: banner.accentColor,
    tagline: banner.tagline,
    variant: banner.variant,
    sideFlags: banner.sideFlags,
    emoji: visuals.emoji,
    isLive: true,
    indicative,
  };
}

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

/** Live HIP-4 markets with odds + $25 payout preview (same catalog as betting dashboard). */
export async function fetchLandingBetMarkets(
  limit = 8,
  stakeUsd = LANDING_BET_STAKE_USD
): Promise<LandingBetMarket[]> {
  if (cachedBetMarkets && Date.now() - betMarketsFetchedAt < EVENTS_TTL_MS) {
    return cachedBetMarkets.slice(0, limit);
  }

  const catalog = await fetchHlOutcomeCatalog();
  const questions = pickLandingBetQuestions(catalog.questions, limit);
  const quoteLegs = questions.flatMap((q) =>
    q.legs.map((leg) => ({ outcomeId: leg.outcomeId, name: leg.name }))
  );
  const quotes = await fetchOutcomeLegQuotesFromMids(quoteLegs);

  const markets = questions
    .map((q) => toBetMarket(q, quotes, stakeUsd))
    .filter((m): m is LandingBetMarket => m != null);

  cachedBetMarkets = markets;
  betMarketsFetchedAt = Date.now();
  return markets.slice(0, limit);
}
