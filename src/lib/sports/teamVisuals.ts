import { previewOutcomeBuy, formatProfitUsd } from '../hyperliquid/outcomes/payout';

/** Map HL outcome / team names to ISO 3166-1 alpha-2 for flagcdn. */
const TEAM_ISO: Record<string, string> = {
  Algeria: 'dz',
  Argentina: 'ar',
  Australia: 'au',
  Austria: 'at',
  Belgium: 'be',
  'Bosnia and Herzegovina': 'ba',
  Brazil: 'br',
  Canada: 'ca',
  'Cape Verde': 'cv',
  Colombia: 'co',
  'Congo DR': 'cd',
  Croatia: 'hr',
  Curacao: 'cw',
  Czechia: 'cz',
  Ecuador: 'ec',
  Egypt: 'eg',
  England: 'gb-eng',
  France: 'fr',
  Germany: 'de',
  Ghana: 'gh',
  Haiti: 'ht',
  Iran: 'ir',
  Iraq: 'iq',
  'Ivory Coast': 'ci',
  Japan: 'jp',
  Jordan: 'jo',
  Mexico: 'mx',
  Morocco: 'ma',
  Netherlands: 'nl',
  'New Zealand': 'nz',
  Norway: 'no',
  Panama: 'pa',
  Portugal: 'pt',
  Qatar: 'qa',
  'Saudi Arabia': 'sa',
  Scotland: 'gb-sct',
  Senegal: 'sn',
  'South Africa': 'za',
  'South Korea': 'kr',
  Spain: 'es',
  Sweden: 'se',
  Switzerland: 'ch',
  Tunisia: 'tn',
  Uruguay: 'uy',
  Uzbekistan: 'uz',
  Draw: 'draw',
};

export type TeamVisual = {
  label: string;
  flagUrl: string | null;
  emoji: string;
};

const EVENT_ICONS = {
  champion: '🏆',
  match: '⚽',
  default: '🎯',
} as const;

export function teamVisual(name: string): TeamVisual {
  const trimmed = name.trim();
  const iso = TEAM_ISO[trimmed];

  if (trimmed.toLowerCase() === 'draw') {
    return { label: trimmed, flagUrl: null, emoji: '⚖️' };
  }

  if (iso && iso !== 'draw') {
    return {
      label: trimmed,
      flagUrl: `https://flagcdn.com/w40/${iso}.png`,
      emoji: '🏳️',
    };
  }

  return { label: trimmed, flagUrl: null, emoji: '🏳️' };
}

export function eventVisual(
  questionName: string,
  category?: string
): { emoji: string; flagUrls: string[] } {
  const lower = questionName.toLowerCase();
  const cat = category?.toLowerCase() ?? '';

  if (cat === 'crypto' || lower.includes('btc') || lower.includes('eth') || lower.includes(' above ')) {
    return { emoji: '₿', flagUrls: [] };
  }
  if (cat === 'macro' || /fed|cpi|inflation/i.test(questionName)) {
    return { emoji: '📊', flagUrls: [] };
  }

  const isChampion = /champion/i.test(questionName);
  const emoji = isChampion ? EVENT_ICONS.champion : EVENT_ICONS.match;

  const vsMatch =
    questionName.match(/World Cup:\s*(.+?)\s+vs\.?\s+(.+)$/i) ??
    questionName.match(/:\s*(.+?)\s+vs\.?\s+(.+)$/i) ??
    questionName.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (vsMatch) {
    const home = teamVisual(vsMatch[1].trim());
    const away = teamVisual(vsMatch[2].trim());
    const flagUrls = [home.flagUrl, away.flagUrl].filter((u): u is string => u != null);
    return { emoji, flagUrls };
  }

  if (isChampion) return { emoji: EVENT_ICONS.champion, flagUrls: [] };

  return { emoji: EVENT_ICONS.default, flagUrls: [] };
}

export function payoutHintUsd100(price: number): string | null {
  const preview = previewOutcomeBuy({ stakeUsd: 100, price });
  if (!preview) return null;
  return formatProfitUsd(preview.profitIfWin);
}
