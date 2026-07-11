import { config } from '../config';
import { fetchSportsRssHeadlines } from './newsFeedService';
import { analyzeNewsItem, INJURY_RE, WIN_RE } from './newsAnalyzerService';
import type { AnalyzedSportsNewsItem, SportsPrognosis } from './newsTypes';

type HlOutcomeLeg = { outcomeId: number; name: string; yesLabel: string; noLabel: string };
type HlBetQuestion = {
  questionId: number;
  name: string;
  category: string;
  legs: HlOutcomeLeg[];
};

type CatalogCache = { at: number; questions: HlBetQuestion[] };

let catalogCache: CatalogCache | null = null;

const DRAW_RE = /\b(draw|tie|x\b|empate|unentschieden|nul)\b/i;
const YES_NO_NAME_RE = /^(yes|no|oui|non|ja|nein)$/i;

type LegKind = 'win' | 'draw' | 'loss' | 'yes_no' | 'other';

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

function classifyLeg(leg: HlOutcomeLeg, index: number, legCount: number): LegKind {
  const n = leg.name.trim();
  if (DRAW_RE.test(n)) return 'draw';
  if (YES_NO_NAME_RE.test(n) || legCount === 1) return 'yes_no';
  if (legCount >= 2 && index === 0) return 'win';
  if (legCount >= 2 && index === legCount - 1) return 'loss';
  if (legCount === 3 && index === 1) return 'draw';
  return 'other';
}

function isYesNoQuestion(q: HlBetQuestion): boolean {
  if (q.legs.length === 1) return true;
  const yes = q.legs[0]?.yesLabel?.toLowerCase() ?? '';
  const no = q.legs[0]?.noLabel?.toLowerCase() ?? '';
  return yes === 'yes' && no === 'no' && q.legs.length <= 2;
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
      outcomes?: {
        outcome: number;
        name: string;
        description: string;
        sideSpecs?: { name: string }[];
      }[];
    };

    const outcomeById = new Map<number, HlOutcomeLeg>();
    for (const o of raw.outcomes ?? []) {
      outcomeById.set(o.outcome, {
        outcomeId: o.outcome,
        name: o.name,
        yesLabel: o.sideSpecs?.[0]?.name ?? 'Yes',
        noLabel: o.sideSpecs?.[1]?.name ?? 'No',
      });
    }

    const questions: HlBetQuestion[] = [];
    for (const q of raw.questions ?? []) {
      const categoryMatch = q.description.match(/category:([^|]+)/i);
      const category = (categoryMatch?.[1] ?? 'other').trim().toLowerCase();
      const legs = (q.namedOutcomes ?? [])
        .map((id) => outcomeById.get(id))
        .filter((l): l is HlOutcomeLeg => Boolean(l));
      if (legs.length < 1) continue;
      questions.push({
        questionId: q.question,
        name: q.name,
        category,
        legs,
      });
    }

    const sports = questions.filter(
      (q) =>
        q.category === 'sports' ||
        q.category === 'crypto' ||
        /\bvs\b|world cup|champions|nations|cup\b|above\b/i.test(q.name)
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
  const yesNo = isYesNoQuestion(question);
  const reasons: string[] = [];

  let favored = legs[0];
  let side: 0 | 1 = 0;
  let shift = 0;
  let marketKind: string = yesNo ? 'yes_no' : 'match';

  if (yesNo) {
    // Binary Yes/No (crypto price targets, props): understand Yes vs No from headline.
    const neg =
      /\b(miss|below|under|fail|reject|no\b|won't|will not|unlikely)\b/i.test(headline) ||
      INJURY_RE.test(headline);
    const pos = WIN_RE.test(headline) || /\b(above|over|hit|reach|break|yes\b|likely)\b/i.test(headline);
    side = neg && !pos ? 1 : 0;
    shift = side === 0 ? 8 : -8;
    reasons.push(
      side === 0
        ? `Yes/No market — lean Yes (${favored.yesLabel}) from headline`
        : `Yes/No market — lean No (${favored.noLabel}) from headline`
    );
    marketKind = 'yes_no';
  } else {
    // 1X2 / multi-leg: pick Win, Draw, or Loss leg.
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const kind = classifyLeg(leg, i, legs.length);
      const name = leg.name.toLowerCase();
      if (name.length < 3 || !text.includes(name)) continue;

      if (kind === 'draw' || DRAW_RE.test(headline)) {
        const drawLeg = legs.find((l, idx) => classifyLeg(l, idx, legs.length) === 'draw') ?? leg;
        favored = drawLeg;
        side = 0;
        shift = 6;
        marketKind = 'draw';
        reasons.push(`Draw lean — headline references ${leg.name}`);
        break;
      }

      if (INJURY_RE.test(headline)) {
        const other =
          legs.find((l, idx) => l.outcomeId !== leg.outcomeId && classifyLeg(l, idx, legs.length) !== 'draw') ??
          leg;
        favored = other;
        side = 0;
        shift = -10;
        marketKind = classifyLeg(
          other,
          legs.findIndex((l) => l.outcomeId === other.outcomeId),
          legs.length
        );
        reasons.push(`${leg.name} injury/news negative — ${other.name} more likely`);
        break;
      }

      if (WIN_RE.test(headline)) {
        favored = leg;
        side = 0;
        shift = 10;
        marketKind = kind;
        reasons.push(`${leg.name} momentum / result signal (${kind})`);
        break;
      }

      favored = leg;
      side = 0;
      shift = 4;
      marketKind = kind;
      reasons.push(`Headline references ${leg.name} (${kind})`);
      break;
    }

    if (reasons.length === 0 && DRAW_RE.test(headline)) {
      const drawLeg = legs.find((l, idx) => classifyLeg(l, idx, legs.length) === 'draw');
      if (drawLeg) {
        favored = drawLeg;
        side = 0;
        shift = 5;
        marketKind = 'draw';
        reasons.push('Headline suggests draw / stalemate');
      }
    }
  }

  if (reasons.length === 0) {
    favored = legs[0];
    side = 0;
    marketKind = yesNo ? 'yes_no' : classifyLeg(legs[0], 0, legs.length);
    reasons.push(`Matched event "${question.name}" — baseline lean`);
  }

  const base = 50 + shift;
  const prognosisPct = Math.max(38, Math.min(72, base + (INJURY_RE.test(headline) ? 8 : 0)));
  const sideLabel = side === 0 ? favored.yesLabel : favored.noLabel;

  return {
    eventName: question.name,
    favoredLeg: yesNo ? `${sideLabel} · ${favored.name}` : favored.name,
    side,
    sideLabel,
    marketKind,
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
