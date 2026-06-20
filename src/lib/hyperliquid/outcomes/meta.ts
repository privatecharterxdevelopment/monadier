import { hlInfoPost } from '../hlInfoClient';
import { buildStandaloneQuestions } from './categories';
import type {
  HlOutcomeMarket,
  HlOutcomeMetaRaw,
  HlOutcomeQuestion,
  HlOutcomeRaw,
} from './types';

function parseQuestionMetadata(description: string): { category: string; subCategory?: string } {
  const match = description.match(/metadata=([^|]+(?:\|[^|]+)*)/i);
  if (!match) return { category: 'other' };

  const parts = match[1].split('|');
  let category = 'other';
  let subCategory: string | undefined;

  for (const part of parts) {
    const [key, value] = part.split(':');
    if (key === 'category' && value) category = value.trim().toLowerCase();
    if (key === 'subCategory' && value) subCategory = value.trim().toLowerCase();
  }

  return { category, subCategory };
}

function normalizeOutcome(raw: HlOutcomeRaw): HlOutcomeMarket {
  return {
    outcomeId: raw.outcome,
    name: raw.name,
    description: raw.description,
    quoteToken: raw.quoteToken ?? 'USDC',
    yesLabel: raw.sideSpecs?.[0]?.name ?? 'Yes',
    noLabel: raw.sideSpecs?.[1]?.name ?? 'No',
  };
}

function buildQuestions(
  raw: HlOutcomeMetaRaw,
  outcomeById: Map<number, HlOutcomeMarket>
): HlOutcomeQuestion[] {
  const questions = raw.questions ?? [];
  return questions
    .map((q) => {
      const meta = parseQuestionMetadata(q.description);
      const legs = q.namedOutcomes
        .map((id) => outcomeById.get(id))
        .filter((m): m is HlOutcomeMarket => m != null);

      return {
        questionId: q.question,
        name: q.name,
        description: q.description,
        category: meta.category,
        subCategory: meta.subCategory,
        fallbackOutcomeId: q.fallbackOutcome,
        legs,
        settledLegIds: q.settledNamedOutcomes ?? [],
      };
    })
    .filter((q) => q.legs.length > 0);
}

export type HlOutcomeCatalog = {
  outcomes: HlOutcomeMarket[];
  /** All browsable betting markets — HL questions + standalone binaries. */
  questions: HlOutcomeQuestion[];
  outcomeById: Map<number, HlOutcomeMarket>;
};

let catalogCache: HlOutcomeCatalog | null = null;
let catalogFetchedAt = 0;
const CATALOG_TTL_MS = 15_000;

export function warmHlOutcomeCatalog(raw: HlOutcomeMetaRaw): HlOutcomeCatalog {
  const outcomes = (raw.outcomes ?? []).map(normalizeOutcome);
  const outcomeById = new Map(outcomes.map((o) => [o.outcomeId, o]));

  const referencedIds = new Set<number>();
  for (const q of raw.questions ?? []) {
    for (const id of q.namedOutcomes) referencedIds.add(id);
    referencedIds.add(q.fallbackOutcome);
  }

  const grouped = buildQuestions(raw, outcomeById);
  const standalone = buildStandaloneQuestions(outcomeById, referencedIds);
  const questions = [...grouped, ...standalone].sort((a, b) => a.name.localeCompare(b.name));

  catalogCache = { outcomes, questions, outcomeById };
  catalogFetchedAt = Date.now();
  return catalogCache;
}

export async function fetchHlOutcomeCatalog(force = false): Promise<HlOutcomeCatalog> {
  if (!force && catalogCache && Date.now() - catalogFetchedAt < CATALOG_TTL_MS) {
    return catalogCache;
  }

  const raw = await hlInfoPost<HlOutcomeMetaRaw>({ type: 'outcomeMeta' });
  return warmHlOutcomeCatalog(raw);
}

export function findOutcomeMarket(
  catalog: HlOutcomeCatalog,
  outcomeId: number
): HlOutcomeMarket | undefined {
  return catalog.outcomeById.get(outcomeId);
}

export function findQuestionForOutcome(
  catalog: HlOutcomeCatalog,
  outcomeId: number
): HlOutcomeQuestion | undefined {
  return catalog.questions.find(
    (q) =>
      q.legs.some((leg) => leg.outcomeId === outcomeId) || q.fallbackOutcomeId === outcomeId
  );
}
