import { fetchHlAllMids, fetchHlMeta } from './hlInfo';
import { fetchHlLiquidUniverse, type HlLiquidUniverse } from './hlLiquidity';
import type { PipelineFunnelRecorder } from './pipelineFunnelLog';
import {
  scanGlobalHlSignals,
  type GlobalScanResult,
  type GlobalSignalCandidate,
} from './globalMarketScan';

export type { GlobalSignalCandidate, GlobalScanResult };

export type TradingCycleContext = {
  cycleId: string;
  startedAt: number;
  meta: Awaited<ReturnType<typeof fetchHlMeta>>;
  mids: Awaited<ReturnType<typeof fetchHlAllMids>>;
  liquidUniverse: HlLiquidUniverse;
  globalScan: GlobalScanResult;
  /** Legacy — standard MTF signals only */
  globalSignals: GlobalSignalCandidate[];
  funnel: PipelineFunnelRecorder;
};

export async function buildTradingCycleContext(
  cycleId: string,
  funnel: PipelineFunnelRecorder
): Promise<TradingCycleContext> {
  const [meta, mids, liquidUniverse] = await Promise.all([
    fetchHlMeta(),
    fetchHlAllMids(),
    fetchHlLiquidUniverse(),
  ]);
  const globalScan = await scanGlobalHlSignals(liquidUniverse, funnel, mids);

  return {
    cycleId,
    startedAt: Date.now(),
    meta,
    mids,
    liquidUniverse,
    globalScan,
    globalSignals: globalScan.standard,
    funnel,
  };
}
