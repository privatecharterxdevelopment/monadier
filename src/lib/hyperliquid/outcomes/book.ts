import { hlInfoPost } from '../hlInfoClient';
import { toNum } from '../parse';
import type { HlL2Book } from '../types';
import { outcomeOrderCoin } from './encoding';
import type { OutcomeBookLevel, OutcomeLegQuote, OutcomeSideBook, OutcomeSideIndex } from './types';

function normalizeLevels(raw: HlL2Book['levels'][number] | undefined): OutcomeBookLevel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      px: toNum(row.px),
      sz: toNum(row.sz),
      n: toNum(row.n, 1),
    }))
    .filter((row) => row.px > 0 && row.sz > 0);
}

function buildSideBook(
  outcomeId: number,
  side: OutcomeSideIndex,
  book: HlL2Book
): OutcomeSideBook {
  const bids = normalizeLevels(book.levels?.[0]);
  const asks = normalizeLevels(book.levels?.[1]);
  const bestBid = bids[0]?.px ?? 0;
  const bestAsk = asks[0]?.px ?? 0;
  const mid =
    bestBid > 0 && bestAsk > 0
      ? (bestBid + bestAsk) / 2
      : bestAsk > 0
        ? bestAsk
        : bestBid;

  return {
    outcomeId,
    side,
    orderCoin: outcomeOrderCoin(outcomeId, side),
    bids,
    asks,
    bestBid,
    bestAsk,
    mid,
    spread: bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0,
  };
}

export async function fetchOutcomeSideBook(
  outcomeId: number,
  side: OutcomeSideIndex
): Promise<OutcomeSideBook> {
  const coin = outcomeOrderCoin(outcomeId, side);
  const book = await hlInfoPost<HlL2Book>({ type: 'l2Book', coin });
  return buildSideBook(outcomeId, side, book);
}

export async function fetchOutcomeLegQuote(
  outcomeId: number,
  name: string
): Promise<OutcomeLegQuote> {
  const [yes, no] = await Promise.all([
    fetchOutcomeSideBook(outcomeId, 0),
    fetchOutcomeSideBook(outcomeId, 1),
  ]);

  const impliedYesPct = yes.mid > 0 ? yes.mid * 100 : no.mid > 0 ? (1 - no.mid) * 100 : 0;

  return { outcomeId, name, yes, no, impliedYesPct };
}

export function outcomeBuyReferencePx(book: OutcomeSideBook): number {
  return book.bestAsk > 0 ? book.bestAsk : book.mid;
}

export function outcomeSellReferencePx(book: OutcomeSideBook): number {
  return book.bestBid > 0 ? book.bestBid : book.mid;
}

/** Single /info call — all outcome mid prices keyed by order coin (#1720). */
export async function fetchOutcomeMidsMap(): Promise<Map<string, number>> {
  const raw = await hlInfoPost<Record<string, string>>({ type: 'allMids' });
  const map = new Map<string, number>();
  for (const [coin, px] of Object.entries(raw ?? {})) {
    if (coin.startsWith('#')) map.set(coin, toNum(px));
  }
  return map;
}

function buildSideBookFromMid(
  outcomeId: number,
  side: OutcomeSideIndex,
  midPx: number
): OutcomeSideBook {
  const px = midPx > 0 ? midPx : 0;
  return {
    outcomeId,
    side,
    orderCoin: outcomeOrderCoin(outcomeId, side),
    bids: [],
    asks: [],
    bestBid: px,
    bestAsk: px,
    mid: px,
    spread: 0,
  };
}

/** Fast quote for UI lists — uses HL allMids (one request for every outcome). */
export function buildLegQuoteFromMids(
  outcomeId: number,
  name: string,
  mids: Map<string, number>
): OutcomeLegQuote {
  let yesMid = mids.get(outcomeOrderCoin(outcomeId, 0)) ?? 0;
  let noMid = mids.get(outcomeOrderCoin(outcomeId, 1)) ?? 0;

  // Thin books often publish only one side's mid — derive the other for display.
  if (yesMid > 0 && yesMid < 1 && noMid <= 0) {
    noMid = Math.max(0.001, Math.min(0.999, 1 - yesMid));
  } else if (noMid > 0 && noMid < 1 && yesMid <= 0) {
    yesMid = Math.max(0.001, Math.min(0.999, 1 - noMid));
  }

  const yes = buildSideBookFromMid(outcomeId, 0, yesMid);
  const no = buildSideBookFromMid(outcomeId, 1, noMid);
  const impliedYesPct = yesMid > 0 ? yesMid * 100 : noMid > 0 ? (1 - noMid) * 100 : 0;
  return { outcomeId, name, yes, no, impliedYesPct };
}

/** Mid price for list/table cells — stable across selection; avoids ask/mid flicker. */
export function outcomeListDisplayPx(book: OutcomeSideBook): number {
  if (book.mid > 0) return book.mid;
  return book.bestAsk > 0 ? book.bestAsk : book.bestBid;
}

export async function fetchOutcomeLegQuotesFromMids(
  legs: Array<{ outcomeId: number; name: string }>
): Promise<Record<number, OutcomeLegQuote>> {
  const mids = await fetchOutcomeMidsMap();
  const out: Record<number, OutcomeLegQuote> = {};
  for (const leg of legs) {
    out[leg.outcomeId] = buildLegQuoteFromMids(leg.outcomeId, leg.name, mids);
  }
  return out;
}
