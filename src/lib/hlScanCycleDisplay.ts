export type HlScanSkip = {
  coin: string;
  mode?: string;
  reason: string;
};

export type ScanCycleCandidate = {
  coin: string;
  direction: string;
  confidence: number;
};

export type ScanCycleRowStatus = 'pass' | 'blocked' | 'open' | 'scanning';

export type ScanCycleRow = {
  coin: string;
  status: ScanCycleRowStatus;
  label: string;
  detail?: string;
};

function latestSkipByCoin(skips: HlScanSkip[]): Map<string, HlScanSkip> {
  const map = new Map<string, HlScanSkip>();
  for (const s of skips) {
    const coin = s.coin?.toUpperCase();
    if (!coin) continue;
    map.set(coin, s);
  }
  return map;
}

export function buildScanCycleRows(opts: {
  universe: string[];
  candidates: ScanCycleCandidate[];
  skips: HlScanSkip[];
  openCoins?: string[];
  currentlyScanning?: string;
  maxRows?: number;
}): ScanCycleRow[] {
  const open = new Set((opts.openCoins ?? []).map((c) => c.toUpperCase()));
  const pass = new Map<string, ScanCycleCandidate>();
  for (const c of opts.candidates) {
    const coin = c.coin?.toUpperCase();
    if (!coin) continue;
    const prev = pass.get(coin);
    if (!prev || c.confidence > prev.confidence) pass.set(coin, c);
  }
  const skipMap = latestSkipByCoin(opts.skips);
  const scanning = opts.currentlyScanning?.toUpperCase();

  const universe =
    opts.universe.length > 0
      ? opts.universe.map((c) => c.toUpperCase())
      : [...new Set([...pass.keys(), ...skipMap.keys()])];

  const rows: ScanCycleRow[] = universe.map((coin) => {
    if (open.has(coin)) {
      return {
        coin,
        status: 'open',
        label: 'Open',
        detail: 'Position already open — scan skips this pair',
      };
    }
    if (scanning === coin) {
      const hit = pass.get(coin);
      if (hit) {
        return {
          coin,
          status: 'pass',
          label: `${hit.direction} ${Math.round(hit.confidence)}%`,
          detail: 'Passes scan bars',
        };
      }
      const sk = skipMap.get(coin);
      if (sk) {
        return {
          coin,
          status: 'blocked',
          label: 'Blocked',
          detail: sk.reason,
        };
      }
      return { coin, status: 'scanning', label: 'Checking…' };
    }
    const hit = pass.get(coin);
    if (hit) {
      return {
        coin,
        status: 'pass',
        label: `${hit.direction} ${Math.round(hit.confidence)}%`,
        detail: 'On scan board — may still fail open gates',
      };
    }
    const sk = skipMap.get(coin);
    if (sk) {
      return {
        coin,
        status: 'blocked',
        label: 'Blocked',
        detail: sk.reason,
      };
    }
    return {
      coin,
      status: 'blocked',
      label: 'No setup',
      detail: 'Not on board this cycle',
    };
  });

  const rank = (s: ScanCycleRowStatus) =>
    s === 'scanning' ? 0 : s === 'open' ? 1 : s === 'pass' ? 2 : 3;

  rows.sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      a.coin.localeCompare(b.coin)
  );

  const max = opts.maxRows ?? 48;
  return rows.slice(0, max);
}

export function formatScanCycleLine(row: ScanCycleRow): string {
  if (row.status === 'blocked' && row.detail) {
    return `${row.coin} | blocked (${row.detail})`;
  }
  if (row.status === 'pass') {
    return `${row.coin} | ✓ ${row.label}`;
  }
  if (row.status === 'open') {
    return `${row.coin} | open`;
  }
  return `${row.coin} | ${row.label}`;
}