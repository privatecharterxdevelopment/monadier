import { config } from '../config';
import { fetchSportsRssHeadlines } from './newsFeedService';
import { analyzeNewsItem, INJURY_RE, WIN_RE } from './newsAnalyzerService';
import type { AnalyzedSportsNewsItem, NewsItem, SportsPrognosis } from './newsTypes';

type HlOutcomeLeg = { outcomeId: number; name: string };
type HlBetQuestion = {
  questionId: number;
  name: string;
  category: string;
  legs: HlOutcomeLeg[];
};

type CatalogCache = { at: number; questions: HlBetQuestion[] };

let catalogCache: CatalogCache | null = null;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function overlapScore(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) {
    if (tb.has(t)) hit += 1;
  }
  return hit / Math.max(ta.size, tb.size);
}

async function fetchBettingQuestions(): Promise<HlBetQuestion[]> {
  const ttl = config.hyperliquid.news.sportsCatalogCacheMs;
  if (catalogCache && Date.now() - catalogCache.at < ttl) {
    return catalogCache.questions;
  }

  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'outcomeMeta' }),
    });
    if (!res.ok) return catalogCache?.questions ?? [];

    const raw = (await res.json()) as {
      questions?: {
        question: number;
        name: string;
        description: string;
        namedOutcomes: number[];
      }[];
      outcomes?: { outcome: number; name: string; description: string }[];
    };

    const outcomeById = new Map<number, HlOutcomeLeg>();
    for (const o of raw.outcomes ?? []) {
      outcomeById.set(o.outcome, { outcomeId: o.outcome, name: o.name });
    }

    const questions: HlBetQuestion[] = [];
    for (const q of raw.questions ?? []) {
      const categoryMatch = q.description.match(/category:([^|]+)/i);
      const category = (categoryMatch?.[1] ?? 'other').trim().toLowerCase();
      const legs = (q.namedOutcomes ?? [])
        .map((id) => outcomeById.get(id))
        .filter((l): l is HlOutcomeLeg => Boolean(l));
      if (legs.length < 2) continue;
      questions.push({
        questionId: q.question,
        name: q.name,
        category,
        legs,
      });
    }

    const sports = questions.filter(
      (q) => q.category === 'sports' || /\bvs\b|world cup|champions|nations|cup\b/i.test(q.name)
    );
    catalogCache = { at: Date.now(), questions: sports };
    return sports;
  } catch {
    return catalogCache?.questions ?? [];
  }
}

function matchQuestion(headline: string, questions: HlBetQuestion[]): HlBetQuestion | null {
  let best: HlBetQuestion | null = null;
  let bestScore = 0;
  for (const q of questions) {
    const score = overlapScore(headline, q.name);
    const legBoost = q.legs.some((l) => overlapScore(headline, l.name) >= 0.45) ? 0.2 : 0;
    const total = score + legBoost;
    if (total > bestScore && total >= 0.25) {
      bestScore = total;
      best = q;
    }
  }
  return best;
}

function buildPrognosis(headline: string, question: HlBetQuestion): SportsPrognosis {
  const text = headline.toLowerCase();
  const legs = question.legs;

  let favored = legs[0];
  let shift = 0;
  const reasons: string[] = [];

  for (const leg of legs) {
    const name = leg.name.toLowerCase();
    if (name.length >= 3 && text.includes(name)) {
      if (INJURY_RE.test(headline)) {
        const other = legs.find((l) => l.outcomeId !== leg.outcomeId) ?? leg;
        favored = other;
        shift = -12;
        reasons.push(`${leg.name} injury/news negative — ${other.name} more likely`);
      } else if (WIN_RE.test(headline)) {
        favored = leg;
        shift = 10;
        reasons.push(`${leg.name} momentum / result signal`);
      } else {
        favored = leg;
        shift = 4;
        reasons.push(`Headline references ${leg.name}`);
      }
      break;
    }
  }

  if (reasons.length === 0) {
    favored = legs[0];
    reasons.push(`Matched event "${question.name}" — baseline lean from headline context`);
  }

  const base = 50 + shift;
  const prognosisPct = Math.max(38, Math.min(72, base + (INJURY_RE.test(headline) ? 8 : 0)));

  return {
    eventName: question.name,
    favoredLeg: favored.name,
    prognosisPct,
    reasoning: reasons.join(' · '),
    outcomeId: favored.outcomeId,
    questionId: question.questionId,
  };
}

export async function fetchAnalyzedSportsNews(limit = 16): Promise<AnalyzedSportsNewsItem[]> {
  const [headlines, questions] = await Promise.all([
    fetchSportsRssHeadlines(),
    fetchBettingQuestions(),
  ]);

  const slice = headlines.slice(0, limit);
  const out: AnalyzedSportsNewsItem[] = [];

  for (const item of slice) {
    const analysis = await analyzeNewsItem(item);
    const match = matchQuestion(item.headline, questions);
    const prognosis = match ? buildPrognosis(item.headline, match) : undefined;

    if (prognosis) {
      analysis.priceHint = `${prognosis.favoredLeg} ~${prognosis.prognosisPct}% AI lean — ${prognosis.reasoning}`;
      analysis.reasoning = prognosis.reasoning;
    }

    out.push({
      ...item,
      analysis,
      prognosis,
      analyzedAt: new Date().toISOString(),
    });
  }

  return out;
}

export function matchSportsHeadlineToEvent(
  headline: string,
  questions: HlBetQuestion[]
): SportsPrognosis | null {
  const match = matchQuestion(headline, questions);
  if (!match) return null;
  return buildPrognosis(headline, match);
}
