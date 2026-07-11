/** Which match results the AI betting agent may stake. */
export type AutoBettingResultPrefs = {
  allowWin: boolean;
  allowDraw: boolean;
  allowLoss: boolean;
};

export const DEFAULT_AUTO_BETTING_RESULT_PREFS: AutoBettingResultPrefs = {
  allowWin: true,
  allowDraw: true,
  allowLoss: true,
};

/** Classify a market leg for agent filtering. */
export type BettingLegKind = 'win' | 'draw' | 'loss' | 'yes_no' | 'other';

const DRAW_RE = /\b(draw|tie|x\b|empate|unentschieden|nul)\b/i;
const YES_NO_RE = /^(yes|no|oui|non|ja|nein)$/i;

export function classifyBettingLegName(name: string, legIndex: number, legCount: number): BettingLegKind {
  const n = name.trim();
  if (!n) return 'other';
  if (DRAW_RE.test(n)) return 'draw';
  if (YES_NO_RE.test(n) || legCount === 1) return 'yes_no';
  // 1X2-style: first = home/win, last = away/loss when 2–3 legs
  if (legCount >= 2 && legIndex === 0) return 'win';
  if (legCount >= 2 && legIndex === legCount - 1) return 'loss';
  if (legCount === 3 && legIndex === 1) return 'draw';
  return 'other';
}

export function isYesNoMarket(legCount: number, legNames: string[]): boolean {
  if (legCount === 1) return true;
  return legNames.every((n) => YES_NO_RE.test(n.trim()) || /yes|no/i.test(n));
}

/** Whether prefs allow staking this classified leg (Yes side of that outcome). */
export function prefsAllowLegKind(prefs: AutoBettingResultPrefs, kind: BettingLegKind): boolean {
  switch (kind) {
    case 'win':
      return prefs.allowWin;
    case 'draw':
      return prefs.allowDraw;
    case 'loss':
      return prefs.allowLoss;
    case 'yes_no':
      // Binary: Win toggle → Yes, Loss toggle → No (handled at side pick)
      return prefs.allowWin || prefs.allowLoss;
    case 'other':
      return prefs.allowWin || prefs.allowDraw || prefs.allowLoss;
    default:
      return false;
  }
}

/**
 * For yes/no binaries: side 0 = Yes, side 1 = No.
 * Win pref → Yes; Loss pref → No; both → prefer Yes unless lean favors No.
 */
export function pickYesNoSide(
  prefs: AutoBettingResultPrefs,
  leanTowardYes: boolean
): 0 | 1 | null {
  if (prefs.allowWin && prefs.allowLoss) return leanTowardYes ? 0 : 1;
  if (prefs.allowWin) return 0;
  if (prefs.allowLoss) return 1;
  return null;
}
