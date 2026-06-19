import { fetchHlAllMids, fetchHlMeta } from './hlInfo';
import { fetchHlLiquidUniverse, type HlLiquidUniverse } from './hlLiquidity';
import {
  scanGlobalHlSignals,
  type GlobalScanResult,
  type GlobalSignalCandidate,
} from './globalMarketScan';

export type { GlobalSignalCandidate, GlobalScanResult };

export type TradingCycleContext = {
  startedAt: number;
  meta: Awaited<ReturnType<typeof fetchHlMeta>>;
  mids: Awaited<ReturnType<typeof fetchHlAllMids>>;
  liquidUniverse: HlLiquidUniverse;
  globalScan: GlobalScanResult;
  /** Legacy — standard MTF signals only */
  globalSignals: GlobalSignalCandidate[];
};

export async function buildTradingCycleContext(): Promise<TradingCycleContext> {
  const [meta, mids, liquidUniverse] = await Promise.all([
    fetchHlMeta(),
    fetchHlAllMids(),
    fetchHlLiquidUniverse(),
  ]);
  const globalScan = await scanGlobalHlSignals(liquidUniverse);

  return {
    startedAt: Date.now(),
    meta,
    mids,
    liquidUniverse,
    globalScan,
    globalSignals: globalScan.standard,
  };
}
