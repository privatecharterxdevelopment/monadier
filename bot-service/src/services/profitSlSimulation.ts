/**
 * Offline walk of the profit-SL state machine against recorded / synthetic ticks.
 * No exchange I/O. Used by tests and the incident reconstruction.
 */
import {
  breakevenPlusFeesStopPx,
  estimateRoundTripFeesUsd,
  evaluateDynamicTrail,
  lockedPnlAtStopPx,
  minProfitTrailGapPx,
  profitProtectionStage,
  shouldArmBreakevenProtection,
  type DynamicTrailRecord,
  type TrailTickInput,
} from './dynamicTrailingStop';
import { hlTickSize } from './hlInfo';
import {
  buildEmergencyStopMarketLeg,
  buildProfitStopLimitLeg,
  profitStopSafeToPost,
  protectiveSideOk,
} from './hlProfitStopSync';

export type SimTick = {
  tMs: number;
  mark: number;
};

export type SimScenario = {
  name: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  absSize: number;
  leverage: number;
  fundingUsd?: number;
  szDecimals?: number;
  stopLossPct?: number;
  ticks: SimTick[];
};

export type SimArmEvent = {
  tMs: number;
  mark: number;
  stage: number;
  stopPx: number;
  minLockUsd: number;
  priceMovePct: number;
  roePct: number;
};

export type SimResult = {
  name: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  absSize: number;
  feesUsd: number;
  beStopPx: number;
  minArmMark: number;
  minArmPriceMovePct: number;
  armedAt: SimArmEvent | null;
  stage2At: SimArmEvent | null;
  finalStage: number;
  finalStopPx: number | null;
  stopNeverWorsened: boolean;
  wouldPostLimit: boolean;
  wouldPostMarketProfit: boolean;
  ticks: Array<{
    tMs: number;
    mark: number;
    pnlUsd: number;
    stage: number;
    stopPx: number | null;
    armed: boolean;
  }>;
};

function pnlAt(
  direction: 'LONG' | 'SHORT',
  entry: number,
  mark: number,
  absSize: number
): number {
  return direction === 'LONG' ? (mark - entry) * absSize : (entry - mark) * absSize;
}

export function scenarioArmThreshold(s: SimScenario): {
  feesUsd: number;
  beStopPx: number;
  minArmMark: number;
  minArmPriceMovePct: number;
} {
  const sz = s.szDecimals ?? 2;
  const notional = s.absSize * s.entry;
  const feesUsd = estimateRoundTripFeesUsd(notional);
  const tick = hlTickSize(s.entry, sz);
  const beStopPx = breakevenPlusFeesStopPx(
    s.direction,
    s.entry,
    s.absSize,
    feesUsd,
    s.fundingUsd ?? 0,
    notional,
    tick,
    sz
  );
  const gap = minProfitTrailGapPx(s.entry, tick);
  const minArmMark =
    s.direction === 'LONG' ? beStopPx + gap : beStopPx - gap;
  const minArmPriceMovePct = (Math.abs(minArmMark - s.entry) / s.entry) * 100;
  return { feesUsd, beStopPx, minArmMark, minArmPriceMovePct };
}

export async function runProfitSlSimulation(s: SimScenario): Promise<SimResult> {
  const sz = s.szDecimals ?? 2;
  const { feesUsd, beStopPx, minArmMark, minArmPriceMovePct } = scenarioArmThreshold(s);
  const tick = hlTickSize(s.entry, sz);
  let record: DynamicTrailRecord | null = null;
  const ticks: SimResult['ticks'] = [];
  let armedAt: SimArmEvent | null = null;
  let stage2At: SimArmEvent | null = null;
  let stopNeverWorsened = true;
  let prevStop: number | null = null;

  for (const tickRow of s.ticks) {
    const pnlUsd = pnlAt(s.direction, s.entry, tickRow.mark, s.absSize);
    const notional = s.absSize * tickRow.mark;
    const collateral = notional / Math.max(1, s.leverage);
    const input: TrailTickInput = {
      coin: s.coin,
      direction: s.direction,
      entryPrice: s.entry,
      markPrice: tickRow.mark,
      pnlUsd,
      absSize: s.absSize,
      notionalUsd: notional,
      collateralUsd: collateral,
      nowMs: tickRow.tMs,
      totalHoldMs: tickRow.tMs - s.ticks[0].tMs,
      stopLossPct: s.stopLossPct ?? 15,
      record,
      fundingUsd: s.fundingUsd ?? 0,
      tickSize: tick,
      szDecimals: sz,
    };
    const out = await evaluateDynamicTrail(input);
    record = out.record;
    const stage = profitProtectionStage(record);
    const stopPx = record.currentTrailStop;
    if (prevStop != null && stopPx != null) {
      if (s.direction === 'LONG' && stopPx < prevStop - 1e-12) stopNeverWorsened = false;
      if (s.direction === 'SHORT' && stopPx > prevStop + 1e-12) stopNeverWorsened = false;
    }
    if (stopPx != null) prevStop = stopPx;
    const roe = collateral > 0 ? (pnlUsd / collateral) * 100 : 0;
    const priceMovePct = ((tickRow.mark - s.entry) / s.entry) * 100;
    if (!armedAt && stage >= 1 && stopPx != null) {
      armedAt = {
        tMs: tickRow.tMs,
        mark: tickRow.mark,
        stage,
        stopPx,
        minLockUsd: lockedPnlAtStopPx(s.direction, s.entry, s.absSize, stopPx),
        priceMovePct,
        roePct: roe,
      };
    }
    if (!stage2At && stage >= 2 && stopPx != null) {
      stage2At = {
        tMs: tickRow.tMs,
        mark: tickRow.mark,
        stage,
        stopPx,
        minLockUsd: lockedPnlAtStopPx(s.direction, s.entry, s.absSize, stopPx),
        priceMovePct,
        roePct: roe,
      };
    }
    ticks.push({
      tMs: tickRow.tMs,
      mark: tickRow.mark,
      pnlUsd,
      stage,
      stopPx,
      armed: stage >= 1,
    });
  }

  const finalStop = record?.currentTrailStop ?? null;
  const wouldPostLimit =
    finalStop != null &&
    profitStopSafeToPost({
      direction: s.direction,
      stopPx: finalStop,
      markPx: s.ticks[s.ticks.length - 1].mark,
      entryPx: s.entry,
      absSize: s.absSize,
      minLockUsd: 0,
      breakevenPx: beStopPx,
      tickSize: tick,
      isMarket: false,
    });

  return {
    name: s.name,
    direction: s.direction,
    entry: s.entry,
    absSize: s.absSize,
    feesUsd,
    beStopPx,
    minArmMark,
    minArmPriceMovePct,
    armedAt,
    stage2At,
    finalStage: record ? profitProtectionStage(record) : 0,
    finalStopPx: finalStop,
    stopNeverWorsened,
    wouldPostLimit,
    wouldPostMarketProfit: false,
    ticks,
  };
}

/** SOL incident: 5.25 SHORT, entry 86.45, first-green ~+$0.01, later red fill. */
export function solIncidentScenario(): SimScenario {
  const entry = 86.45;
  const size = 5.25;
  const t0 = 1_700_000_000_000;
  return {
    name: 'SOL SHORT incident (5.25 @ 86.45)',
    coin: 'SOL',
    direction: 'SHORT',
    entry,
    absSize: size,
    leverage: 20,
    szDecimals: 2,
    ticks: [
      { tMs: t0, mark: 86.45 },
      { tMs: t0 + 400, mark: 86.448 },
      { tMs: t0 + 1_200, mark: 86.44 },
      { tMs: t0 + 2_000, mark: 86.42 },
      { tMs: t0 + 3_000, mark: 86.35 },
      { tMs: t0 + 4_000, mark: 86.25 },
      { tMs: t0 + 5_000, mark: 86.1 },
      { tMs: t0 + 8_000, mark: 85.8 },
      { tMs: t0 + 12_000, mark: 86.0 },
      { tMs: t0 + 16_000, mark: 86.2 },
      { tMs: t0 + 20_000, mark: 86.518 },
    ],
  };
}

export function longBtcRunScenario(): SimScenario {
  const entry = 60_000;
  const t0 = 1_700_000_100_000;
  return {
    name: 'BTC LONG run',
    coin: 'BTC',
    direction: 'LONG',
    entry,
    absSize: 0.01,
    leverage: 20,
    szDecimals: 5,
    ticks: [
      { tMs: t0, mark: 60_000 },
      { tMs: t0 + 500, mark: 60_010 },
      { tMs: t0 + 1_200, mark: 60_040 },
      { tMs: t0 + 2_000, mark: 60_120 },
      { tMs: t0 + 4_000, mark: 60_400 },
      { tMs: t0 + 8_000, mark: 61_200 },
      { tMs: t0 + 12_000, mark: 61_000 },
      { tMs: t0 + 16_000, mark: 60_800 },
    ],
  };
}

export function shortEthEarlyGreenScenario(): SimScenario {
  const entry = 3_200;
  const t0 = 1_700_000_200_000;
  return {
    name: 'ETH SHORT first-green then stall',
    coin: 'ETH',
    direction: 'SHORT',
    entry,
    absSize: 0.2,
    leverage: 20,
    szDecimals: 4,
    ticks: [
      { tMs: t0, mark: 3_200 },
      { tMs: t0 + 300, mark: 3_199.5 },
      { tMs: t0 + 1_200, mark: 3_199.2 },
      { tMs: t0 + 2_000, mark: 3_198.8 },
      { tMs: t0 + 4_000, mark: 3_190 },
      { tMs: t0 + 8_000, mark: 3_185 },
    ],
  };
}

export function explainWouldArmAt(
  s: SimScenario,
  mark: number,
  holdMs = 2_000
): boolean {
  const notional = s.absSize * mark;
  const feesUsd = estimateRoundTripFeesUsd(s.absSize * s.entry);
  const tick = hlTickSize(mark, s.szDecimals ?? 2);
  const pnlUsd = pnlAt(s.direction, s.entry, mark, s.absSize);
  return shouldArmBreakevenProtection({
    direction: s.direction,
    pnlUsd,
    markPrice: mark,
    entryPrice: s.entry,
    absSize: s.absSize,
    feesUsd,
    fundingUsd: s.fundingUsd ?? 0,
    tickSize: tick,
    szDecimals: s.szDecimals ?? 2,
    timeInProfitMs: holdMs,
    collateralUsd: notional / Math.max(1, s.leverage),
    notionalUsd: notional,
  });
}

export function sampleProfitLimitLeg() {
  return buildProfitStopLimitLeg({
    assetIndex: 5,
    direction: 'SHORT',
    size: 5.25,
    stopPx: 86.32,
    szDecimals: 2,
  });
}

export function sampleEmergencyLeg() {
  return buildEmergencyStopMarketLeg({
    assetIndex: 5,
    direction: 'SHORT',
    size: 5.25,
    stopPx: 87.3,
    szDecimals: 2,
  });
}

export function protectiveAt(args: Parameters<typeof protectiveSideOk>) {
  return protectiveSideOk(...args);
}
