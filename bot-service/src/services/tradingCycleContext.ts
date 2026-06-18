import { fetchHlAllMids, fetchHlMeta } from './hlInfo';
import { scanGlobalHlSignals, type GlobalSignalCandidate } from './globalMarketScan';

export type TradingCycleContext = {
  startedAt: number;
  meta: Awaited<ReturnType<typeof fetchHlMeta>>;
  mids: Awaited<ReturnType<typeof fetchHlAllMids>>;
  globalSignals: GlobalSignalCandidate[];
};

/** Shared HL meta + universe signals — built once per trading cycle for all users. */
export async function buildTradingCycleContext(): Promise<TradingCycleContext> {
  const [meta, mids, globalSignals] = await Promise.all([
    fetchHlMeta(),
    fetchHlAllMids(),
    scanGlobalHlSignals(),
  ]);

  return {
    startedAt: Date.now(),
    meta,
    mids,
    globalSignals,
  };
}
