import {
  fetchLandingBetMarkets,
  type LandingBetMarket,
} from '../api/landingSportsEvents';

export const BENTO_BET_STAKE_USD = 50;

export type BentoSportsBetCard = {
  id: string;
  pairLabel: string;
  selection: string;
  winAmount: string;
  stakeValue: string;
  odds: string;
};

function parseUsdAmount(label: string): number {
  const n = Number.parseFloat(label.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseOddsMultiplier(odds: string): number {
  const n = Number.parseFloat(odds.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function formatWinUsd(amount: number): string {
  if (amount >= 1000) return `$${Math.round(amount).toLocaleString()}`;
  return `$${amount.toFixed(2)}`;
}

function isSportsMarket(m: LandingBetMarket): boolean {
  const hay = `${m.categoryBadge} ${m.title} ${m.cardTitle} ${m.cardHeadline}`.toLowerCase();
  return /sport|football|basketball|world cup|nba|nfl|match|vs|cup|league|tennis|ufc|mlb|nhl/.test(hay);
}

function toSportsBetCard(m: LandingBetMarket): BentoSportsBetCard {
  const payoutAt25 = parseUsdAmount(m.payoutLabel);
  const scaledWin = payoutAt25 > 0 ? (payoutAt25 * BENTO_BET_STAKE_USD) / 25 : BENTO_BET_STAKE_USD * parseOddsMultiplier(m.odds);

  return {
    id: m.id,
    pairLabel: m.cardTitle,
    selection: m.selection,
    winAmount: formatWinUsd(scaledWin),
    stakeValue: formatWinUsd(BENTO_BET_STAKE_USD),
    odds: m.odds,
  };
}

const FALLBACK_SPORTS: BentoSportsBetCard[] = [
  {
    id: 'fallback-wc-france',
    pairLabel: 'World Cup 2026',
    selection: 'Yes · France',
    winAmount: '$400.00',
    stakeValue: '$50.00',
    odds: '~8.00×',
  },
  {
    id: 'fallback-arg-cv',
    pairLabel: 'Argentina vs Cape Verde',
    selection: 'Yes · Argentina',
    winAmount: '$750.00',
    stakeValue: '$50.00',
    odds: '~15.00×',
  },
  {
    id: 'fallback-lakers',
    pairLabel: 'Lakers vs Celtics',
    selection: 'Yes · Lakers',
    winAmount: '$86.00',
    stakeValue: '$50.00',
    odds: '~1.72×',
  },
  {
    id: 'fallback-brazil',
    pairLabel: 'World Cup 2026',
    selection: 'Yes · Brazil',
    winAmount: '$122.00',
    stakeValue: '$50.00',
    odds: '~2.44×',
  },
  {
    id: 'fallback-nba',
    pairLabel: 'NBA Finals',
    selection: 'Yes · Celtics',
    winAmount: '$215.00',
    stakeValue: '$50.00',
    odds: '~4.30×',
  },
];

export async function fetchBentoSportsBetCards(): Promise<BentoSportsBetCard[]> {
  try {
    const markets = await fetchLandingBetMarkets(24);
    const sports = markets.filter(isSportsMarket).map(toSportsBetCard);
    const merged: BentoSportsBetCard[] = [...sports];
    const seen = new Set(sports.map((c) => c.id));

    for (const fb of FALLBACK_SPORTS) {
      if (merged.length >= 12) break;
      if (!seen.has(fb.id)) {
        merged.push(fb);
        seen.add(fb.id);
      }
    }

    return merged.length > 0 ? merged : FALLBACK_SPORTS;
  } catch {
    return FALLBACK_SPORTS;
  }
}
