export type PredictionAccessContext = {
  profileCountry?: string | null;
  ipCountry?: string | null;
};

export type PredictionAccessResult = {
  allowed: boolean;
  reason?: string;
  countryLabel?: string;
};

/** ISO-ish country names/codes blocked from sports / outcome markets (expand as needed). */
const BLOCKED_COUNTRIES = new Set(
  [
    'United States',
    'US',
    'USA',
    'United Kingdom',
    'UK',
    'GB',
    'France',
    'FR',
    'Netherlands',
    'NL',
    'Singapore',
    'SG',
    'Australia',
    'AU',
  ].map((c) => c.toLowerCase())
);

function normalizeCountry(raw?: string | null): string {
  return (raw ?? '').trim().toLowerCase();
}

function isBlockedCountry(country: string): boolean {
  if (!country) return false;
  if (BLOCKED_COUNTRIES.has(country)) return true;
  for (const blocked of BLOCKED_COUNTRIES) {
    if (country.includes(blocked) || blocked.includes(country)) return true;
  }
  return false;
}

export function canAccessSportsbets(ctx: PredictionAccessContext): PredictionAccessResult {
  const profile = normalizeCountry(ctx.profileCountry);
  const ip = normalizeCountry(ctx.ipCountry);
  const countryLabel = ctx.profileCountry?.trim() || ctx.ipCountry?.trim() || '';

  if (isBlockedCountry(profile)) {
    return {
      allowed: false,
      countryLabel,
      reason: 'Sports betting is not available in your profile country.',
    };
  }

  if (profile && ip && isBlockedCountry(ip) && !isBlockedCountry(profile)) {
    return {
      allowed: false,
      countryLabel: ctx.ipCountry?.trim() || countryLabel,
      reason: 'Your detected location does not match an eligible region for sports betting.',
    };
  }

  if (!profile && isBlockedCountry(ip)) {
    return {
      allowed: false,
      countryLabel: ctx.ipCountry?.trim() || countryLabel,
      reason: 'Sports betting is not available in your region.',
    };
  }

  return { allowed: true, countryLabel };
}
