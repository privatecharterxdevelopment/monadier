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
