import { MIN_HL_BOT_USD } from './hlBotAgent';

/** Server/bot-status balance copy that disagrees with live HL snapshot on the client. */
export function isStaleHlBalanceBlocker(
  message: string,
  clientEquityUsd: number,
  minUsd = MIN_HL_BOT_USD
): boolean {
  if (clientEquityUsd < minUsd) return false;
  const t = message.trim();
  if (!t) return false;
  return (
    /HL account equity/i.test(t) ||
    /HL perp balance/i.test(t) ||
    /HL balance \$/i.test(t) ||
    /Perp margin \$/i.test(t) ||
    /Must deposit before performing actions/i.test(t) ||
    /HL balance check failed/i.test(t)
  );
}

/**
 * Transient HL /info blips often report $0 free margin while the live client
 * wallet still shows a funded idle account — do not pause the analyzer on that.
 */
export function isStaleInsufficientMarginBlocker(
  message: string,
  clientEquityUsd: number,
  openPositionCount = 0,
  minUsd = MIN_HL_BOT_USD
): boolean {
  if (clientEquityUsd < minUsd) return false;
  if (!/insufficient margin|free margin too low|margin too small/i.test(message)) {
    return false;
  }
  // Failed / empty HL snapshot while client equity is healthy.
  if (/\$0(?:\.0+)?\s+free/i.test(message) && /from \$0(?:\.0+)?/i.test(message)) {
    return true;
  }
  if (openPositionCount > 0) return false;
  const freeMatch = message.match(/\$([0-9]+(?:\.[0-9]+)?)\s+free/i);
  if (freeMatch) {
    const free = Number(freeMatch[1]);
    if (Number.isFinite(free) && free < minUsd && clientEquityUsd >= minUsd) {
      return true;
    }
  }
  const fromMatch = message.match(/from \$([0-9]+(?:\.[0-9]+)?)/i);
  if (fromMatch) {
    const bal = Number(fromMatch[1]);
    if (Number.isFinite(bal) && bal < minUsd && clientEquityUsd >= minUsd) {
      return true;
    }
  }
  return false;
}

export function filterStaleHlBalanceBlockers(
  blockers: string[],
  clientEquityUsd: number,
  minUsd = MIN_HL_BOT_USD,
  openPositionCount = 0
): string[] {
  return blockers.filter(
    (b) =>
      !isStaleHlBalanceBlocker(b, clientEquityUsd, minUsd) &&
      !isStaleInsufficientMarginBlocker(b, clientEquityUsd, openPositionCount, minUsd)
  );
}

/** Hide stale last-open noise when the wallet is funded on the client. */
export function shouldHideLastOpenError(
  error: string,
  clientEquityUsd: number,
  minUsd = MIN_HL_BOT_USD,
  openPositionCount = 0
): boolean {
  if (isStaleHlBalanceBlocker(error, clientEquityUsd, minUsd)) return true;
  if (isStaleInsufficientMarginBlocker(error, clientEquityUsd, openPositionCount, minUsd)) {
    return true;
  }
  if (clientEquityUsd < minUsd) return false;
  return (
    /Waiting for pullback/i.test(error) ||
    /pullback to buy low/i.test(error) ||
    /rally to sell high/i.test(error) ||
    /waiting for cleaner setup/i.test(error) ||
    /candle structure blocks entry/i.test(error) ||
    /Funding\/24h range blocks chasing/i.test(error) ||
    /volume\/liquidity check/i.test(error)
  );
}
