import React, { useMemo } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import {
  buildScanCycleRows,
  formatScanCycleLine,
  type HlScanSkip,
  type ScanCycleCandidate,
} from '../../lib/hlScanCycleDisplay';

type Props = {
  universe: string[];
  candidates: ScanCycleCandidate[];
  skips: HlScanSkip[];
  openCoins?: string[];
  currentlyScanning?: string;
  scannedAt?: string;
  coinsScanned?: number;
  scanComplete?: boolean;
  collapsed?: boolean;
};

const ProTradeScanCyclePanel: React.FC<Props> = ({
  universe,
  candidates,
  skips,
  openCoins = [],
  currentlyScanning,
  scannedAt,
  coinsScanned = 0,
  scanComplete = true,
  collapsed = false,
}) => {
  const rows = useMemo(
    () =>
      buildScanCycleRows({
        universe,
        candidates,
        skips,
        openCoins,
        currentlyScanning,
        maxRows: 56,
      }),
    [universe, candidates, skips, openCoins, currentlyScanning]
  );

  if (rows.length === 0) return null;

  const passCount = rows.filter((r) => r.status === 'pass').length;
  const blockCount = rows.filter((r) => r.status === 'blocked').length;

  return (
    <div className="hl-scan-cycle-panel" role="region" aria-label="HL scan cycle">
      <div className="hl-scan-cycle-head">
        <span className="hl-scan-cycle-title">Scan cycle</span>
        <span className="hl-scan-cycle-meta">
          {coinsScanned > 0 ? `${coinsScanned} perps · ` : ''}
          {passCount} pass · {blockCount} blocked
          {!scanComplete ? ' · scanning…' : ''}
        </span>
      </div>
      {!collapsed ? (
        <ul className="hl-scan-cycle-list">
          {rows.map((row) => (
            <li
              key={row.coin}
              className={`hl-scan-cycle-row hl-scan-cycle-row--${row.status}`}
              title={formatScanCycleLine(row)}
            >
              <span className="hl-scan-cycle-icon" aria-hidden>
                {row.status === 'scanning' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : row.status === 'pass' ? (
                  <Check size={12} />
                ) : row.status === 'open' ? (
                  <Check size={12} className="hl-scan-cycle-icon--muted" />
                ) : (
                  <X size={12} />
                )}
              </span>
              <span className="hl-scan-cycle-coin">{row.coin}</span>
              <span className="hl-scan-cycle-status">
                {row.status === 'blocked' && row.detail
                  ? `blocked · ${row.detail}`
                  : row.status === 'pass'
                    ? row.label
                    : row.status === 'open'
                      ? 'open'
                      : row.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {scannedAt ? (
        <p className="hl-scan-cycle-foot">
          Last full scan {new Date(scannedAt).toLocaleTimeString()}
        </p>
      ) : null}
    </div>
  );
};

export default ProTradeScanCyclePanel;