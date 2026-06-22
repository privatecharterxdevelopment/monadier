/** Keep in sync with bot-service weekendTradingRules + HL_FRIDAY_SHORT_ONLY_UTC_HOUR. */
export const FRIDAY_SHORT_ONLY_UTC_HOUR = 18;

export type BotTradingWindowState = {
  shortOnlyWindow: boolean;
  longOpensAllowed: boolean;
  shortOpensAllowed: boolean;
  headline: string;
  detail: string;
  nextChangeAt: Date;
  nextChangeSummary: string;
};

function nextFridayShortOnlyStart(from: Date): Date {
  const d = new Date(from);
  d.setUTCSeconds(0, 0);
  const dow = d.getUTCDay();
  let daysUntilFriday = (5 - dow + 7) % 7;
  if (daysUntilFriday === 0 && d.getUTCHours() >= FRIDAY_SHORT_ONLY_UTC_HOUR) {
    daysUntilFriday = 7;
  }
  d.setUTCDate(d.getUTCDate() + daysUntilFriday);
  d.setUTCHours(FRIDAY_SHORT_ONLY_UTC_HOUR, 0, 0, 0);
  return d;
}

function nextSaturdayUtcMidnight(from: Date): Date {
  const d = new Date(from);
  d.setUTCSeconds(0, 0);
  const dow = d.getUTCDay();
  if (dow === 5) {
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  return nextFridayShortOnlyStart(from);
}

export function isFridayShortOnlyWindow(now: Date = new Date()): boolean {
  return now.getUTCDay() === 5 && now.getUTCHours() >= FRIDAY_SHORT_ONLY_UTC_HOUR;
}

export function getBotTradingWindowState(now: Date = new Date()): BotTradingWindowState {
  const shortOnlyWindow = isFridayShortOnlyWindow(now);

  if (shortOnlyWindow) {
    const nextChangeAt = nextSaturdayUtcMidnight(now);
    return {
      shortOnlyWindow: true,
      longOpensAllowed: false,
      shortOpensAllowed: true,
      headline: 'SHORT only (Friday rule)',
      detail:
        'New LONG positions are paused until Saturday 00:00 UTC. SHORT setups still open normally.',
      nextChangeAt,
      nextChangeSummary: 'LONG + SHORT resume',
    };
  }

  const nextChangeAt = nextFridayShortOnlyStart(now);
  return {
    shortOnlyWindow: false,
    longOpensAllowed: true,
    shortOpensAllowed: true,
    headline: 'LONG + SHORT open',
    detail:
      'Bot can open long and short on HL perps. Friday 18:00 UTC → midnight UTC is SHORT-only for new entries.',
    nextChangeAt,
    nextChangeSummary: 'SHORT-only window starts',
  };
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

export function formatInTimeZone(iso: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(iso);
  } catch {
    return iso.toUTCString();
  }
}
