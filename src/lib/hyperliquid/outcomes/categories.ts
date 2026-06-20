import type { HlOutcomeMarket, HlOutcomeQuestion } from './types';
import {
  parsePriceBinaryMeta,
  formatPriceBinaryTitle,
} from './priceBinaryDisplay';

export type BettingCategoryId = 'all' | 'sports' | 'crypto' | 'macro' | 'other';

export type BettingCategoryTab = {
  id: BettingCategoryId;
  label: string;
  emoji: string;
};

export const BETTING_CATEGORY_TABS: BettingCategoryTab[] = [
  { id: 'all', label: 'All', emoji: '' },
  { id: 'sports', label: 'Sports', emoji: '⚽' },
  { id: 'crypto', label: 'Crypto', emoji: '₿' },
  { id: 'macro', label: 'Macro', emoji: '' },
  { id: 'other', label: 'More', emoji: '' },
];

const MACRO_KEYWORDS = ['fed', 'cpi', 'inflation', 'interest rate', 'gdp', 'unemployment', 'fomc'];
const CRYPTO_KEYWORDS = ['btc', 'bitcoin', 'eth', 'ethereum', 'sol', 'hype', 'pricebinary', 'recurring'];

function textBlob(question: HlOutcomeQuestion): string {
  return `${question.name} ${question.description} ${question.legs.map((l) => `${l.name} ${l.description}`).join(' ')}`.toLowerCase();
}

export function resolveBettingCategory(question: HlOutcomeQuestion): BettingCategoryId {
  if (question.category === 'sports' || question.subCategory === 'football') return 'sports';

  const blob = textBlob(question);

  if (
    question.category === 'crypto' ||
    blob.includes('class:pricebinary') ||
    CRYPTO_KEYWORDS.some((kw) => blob.includes(kw))
  ) {
    return 'crypto';
  }

  if (question.category === 'macro' || MACRO_KEYWORDS.some((kw) => blob.includes(kw))) {
    return 'macro';
  }

  if (
    blob.includes('world cup') ||
    blob.includes('fifa') ||
    blob.includes(' vs ') ||
    blob.includes('football') ||
    blob.includes('champion')
  ) {
    return 'sports';
  }

  return 'other';
}

export function categoryLabel(id: BettingCategoryId): string {
  return BETTING_CATEGORY_TABS.find((t) => t.id === id)?.label ?? id;
}

export function categoryEmoji(id: BettingCategoryId): string {
  return BETTING_CATEGORY_TABS.find((t) => t.id === id)?.emoji ?? '◎';
}

export function countByCategory(questions: HlOutcomeQuestion[]): Record<BettingCategoryId, number> {
  const counts: Record<BettingCategoryId, number> = {
    all: questions.length,
    sports: 0,
    crypto: 0,
    macro: 0,
    other: 0,
  };
  for (const q of questions) {
    counts[resolveBettingCategory(q)] += 1;
  }
  return counts;
}

export function filterBettingQuestions(
  questions: HlOutcomeQuestion[],
  category: BettingCategoryId,
  query: string
): HlOutcomeQuestion[] {
  const q = query.trim().toLowerCase();
  return questions.filter((item) => {
    if (category !== 'all' && resolveBettingCategory(item) !== category) return false;
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.legs.some((leg) => leg.name.toLowerCase().includes(q) || leg.description.toLowerCase().includes(q))
    );
  });
}

export function formatCategoryBadge(question: HlOutcomeQuestion): string {
  const cat = resolveBettingCategory(question);
  if (cat === 'sports' && question.subCategory) {
    return question.subCategory.charAt(0).toUpperCase() + question.subCategory.slice(1);
  }
  return categoryLabel(cat);
}

/** Turn orphan HL outcomes (e.g. daily BTC binary) into browsable single-leg questions. */
export function buildStandaloneQuestions(
  outcomeById: Map<number, HlOutcomeMarket>,
  referencedIds: Set<number>
): HlOutcomeQuestion[] {
  const standalone: HlOutcomeQuestion[] = [];

  for (const market of outcomeById.values()) {
    if (referencedIds.has(market.outcomeId)) continue;
    if (market.name === 'Fallback' && !market.description) continue;

    const title = parseStandaloneTitle(market);
    standalone.push({
      questionId: -market.outcomeId,
      name: title,
      description: market.description,
      category: market.description.includes('priceBinary') ? 'crypto' : 'other',
      fallbackOutcomeId: market.outcomeId,
      legs: [market],
      settledLegIds: [],
    });
  }

  return standalone.sort((a, b) => a.name.localeCompare(b.name));
}

function parseStandaloneTitle(market: HlOutcomeMarket): string {
  const meta = parsePriceBinaryMeta(market.description);
  if (meta) return formatPriceBinaryTitle(meta);
  return market.name || `Outcome ${market.outcomeId}`;
}

export function questionListSubtitle(question: HlOutcomeQuestion): string {
  const badge = formatCategoryBadge(question);
  const meta = parsePriceBinaryMeta(question.description) ??
    question.legs.map((l) => parsePriceBinaryMeta(l.description)).find((m) => m != null);
  if (meta) {
    const target =
      meta.targetPrice != null
        ? `$${meta.targetPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : '';
    return target ? `${badge} · above ${target}` : badge;
  }
  const legs = question.legs.length;
  if (legs === 1) return badge;
  return `${badge} · ${legs} outcomes`;
}

export {
  formatBettingQuestionTitle,
  formatBettingQuestionSummary,
  formatBettingLegName,
  formatBettingMarketName,
} from './priceBinaryDisplay';
