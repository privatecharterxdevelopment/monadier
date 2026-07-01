import { config } from '../config';
import type { GlobalSignalCandidate } from './globalMarketScan';
import { FUNNEL } from './pipelineFunnelReasons';

export type PriceValidityResult = {
  ok: boolean;
  reason: string;
  driftPct: number | null;
};

/** Open-time check — price must not have moved too far since scan signal. */
export function validateScanPriceDrift(opts: {
  pick: GlobalSignalCandidate;
  currentMarkPx: number;
}): PriceValidityResult {
  const maxDriftPct = config.hyperliquid.openPriceMaxDriftPct;
  const scanPx = opts.pick.scanMarkPx;
  const scanAt = opts.pick.scanAt;

  if (!scanPx || !scanAt || scanPx <= 0) {
    return {
      ok: true,
      reason: 'Price drift check skipped — no scan reference price',
      driftPct: null,
    };
  }

  const driftPct = ((opts.currentMarkPx - scanPx) / scanPx) * 100;
  const absDrift = Math.abs(driftPct);

  if (absDrift > maxDriftPct) {
    return {
      ok: false,
      reason:
        `${FUNNEL.open.priceDrift}: ${opts.pick.coin} moved ${driftPct >= 0 ? '+' : ''}${driftPct.toFixed(2)}% ` +
        `since scan (${absDrift.toFixed(2)}% > ${maxDriftPct}% max)`,
      driftPct,
    };
  }

  return {
    ok: true,
    reason: `Price drift OK — ${driftPct >= 0 ? '+' : ''}${driftPct.toFixed(2)}% since scan`,
    driftPct,
  };
}
