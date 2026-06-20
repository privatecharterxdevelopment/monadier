import type { BettingCategoryId } from '../hyperliquid/outcomes/categories';
import type { HlOutcomeQuestion } from '../hyperliquid/outcomes/types';
import { teamVisual } from './teamVisuals';

export type EventBannerVariant =
  | 'world-cup-champion'
  | 'world-cup-match'
  | 'crypto'
  | 'macro'
  | 'sports'
  | 'default';

export type EventBannerSide = {
  url: string;
  label: string;
};

export type EventBannerVisual = {
  variant: EventBannerVariant;
  backgroundImage: string;
  accentColor: string;
  tagline: string | null;
  sideFlags: EventBannerSide[];
};

const BANNERS = {
  worldCup: '/images/betting/world-cup-hero.png',
  sports: '/images/betting/sports-hero.png',
  crypto: '/images/betting/crypto-hero.png',
} as const;

const FEATURED_TEAMS = [
  'Brazil',
  'Argentina',
  'France',
  'Germany',
  'England',
  'Spain',
  'Portugal',
  'Netherlands',
  'Italy',
  'Mexico',
  'USA',
  'Belgium',
];

function legSideFlags(question: HlOutcomeQuestion, limit = 2): EventBannerSide[] {
  const byName = new Map<string, EventBannerSide>();
  for (const leg of question.legs) {
    const visual = teamVisual(leg.name);
    if (!visual.flagUrl) continue;
    byName.set(leg.name, { url: visual.flagUrl, label: visual.label });
  }

  const featured: EventBannerSide[] = [];
  for (const name of FEATURED_TEAMS) {
    const side = byName.get(name);
    if (side) featured.push(side);
    if (featured.length >= limit) return featured;
  }

  return [...byName.values()].slice(0, limit);
}

function parseWorldCupMatch(title: string): EventBannerSide[] {
  const vsMatch = title.match(/World Cup:\s*(.+?)\s+vs\s+(.+)$/i);
  if (!vsMatch) return [];
  const home = teamVisual(vsMatch[1].trim());
  const away = teamVisual(vsMatch[2].trim());
  return [home, away]
    .filter((t) => t.flagUrl)
    .map((t) => ({ url: t.flagUrl!, label: t.label }));
}

export function resolveEventBanner(
  question: HlOutcomeQuestion,
  title: string,
  category: BettingCategoryId
): EventBannerVisual {
  const lower = title.toLowerCase();
  const isWorldCup = lower.includes('world cup');
  const isChampion = /champion/i.test(title);
  const matchFlags = parseWorldCupMatch(title);

  if (isWorldCup && isChampion) {
    return {
      variant: 'world-cup-champion',
      backgroundImage: BANNERS.worldCup,
      accentColor: '#e53935',
      tagline: 'WHO WILL LIFT THE TROPHY?',
      sideFlags: legSideFlags(question, 2),
    };
  }

  if (isWorldCup && matchFlags.length >= 2) {
    return {
      variant: 'world-cup-match',
      backgroundImage: BANNERS.worldCup,
      accentColor: '#e53935',
      tagline: 'MATCH WINNER · LIVE ODDS',
      sideFlags: matchFlags.slice(0, 2),
    };
  }

  if (category === 'crypto' || lower.includes('btc') || lower.includes('eth')) {
    return {
      variant: 'crypto',
      backgroundImage: BANNERS.crypto,
      accentColor: '#f7931a',
      tagline: 'TRADE THE MOVE · LIVE PRICES',
      sideFlags: [],
    };
  }

  if (category === 'macro') {
    return {
      variant: 'macro',
      backgroundImage: BANNERS.sports,
      accentColor: '#42a5f5',
      tagline: 'MACRO MARKET · YES OR NO',
      sideFlags: [],
    };
  }

  if (category === 'sports') {
    return {
      variant: 'sports',
      backgroundImage: BANNERS.sports,
      accentColor: '#e53935',
      tagline: 'LIVE SPORTS BETTING',
      sideFlags: legSideFlags(question, 2),
    };
  }

  return {
    variant: 'default',
    backgroundImage: BANNERS.sports,
    accentColor: '#26a69a',
    tagline: null,
    sideFlags: [],
  };
}
