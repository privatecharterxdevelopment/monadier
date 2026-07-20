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
    /Must deposit before performing actions/i.test(t)
  );
}

export function filterStaleHlBalanceBlockers(
  blockers: string[],
  clientEquityUsd: number,
  minUsd = MIN_HL_BOT_USD
): string[] {
  return blockers.filter((b) => !isStaleHlBalanceBlocker(b, clientEquityUsd, minUsd));
}

/** Hide stale last-open noise when the wallet is funded on the client. */
export function shouldHideLastOpenError(
  error: string,
  clientEquityUsd: number,
  minUsd = MIN_HL_BOT_USD
): boolean {
  if (isStaleHlBalanceBlocker(error, clientEquityUsd, minUsd)) return true;
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
