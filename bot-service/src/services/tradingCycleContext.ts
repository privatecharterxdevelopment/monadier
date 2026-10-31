import { fetchHlAllMids, fetchHlMeta } from './hlInfo';
import { fetchHlLiquidUniverse, type HlLiquidUniverse } from './hlLiquidity';
import {
  scanGlobalHlSignals,
  type GlobalScanResult,
  type GlobalSignalCandidate,
} from './globalMarketScan';
import { refreshLiveDirectionProfile } from './liveDirectionProfile';
import type { HlDirectionProfile } from '../config/profiles/types';
import type { BtcRegimeSnapshot } from './btcMarketRegime';
import { getLastBtcMarketRegime } from './btcMarketRegime';

export type { GlobalSignalCandidate, GlobalScanResult };

export type TradingCycleContext = {
  startedAt: number;
  meta: Awaited<ReturnType<typeof fetchHlMeta>>;
  mids: Awaited<ReturnType<typeof fetchHlAllMids>>;
  liquidUniverse: HlLiquidUniverse;
  globalScan: GlobalScanResult;
  /** Legacy — standard MTF signals only */
  globalSignals: GlobalSignalCandidate[];
  directionProfile: HlDirectionProfile;
  btcRegime: BtcRegimeSnapshot | null;
};

export async function buildTradingCycleContext(): Promise<TradingCycleContext> {
  // BTC auto (or forced env) — must run before scan so gates use the live profile.
  const directionProfile = await refreshLiveDirectionProfile();

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
    directionProfile,
    btcRegime: getLastBtcMarketRegime(),
  };
}
