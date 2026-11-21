import { describe, expect, it } from 'vitest';
import { adminLivePositionPnl, hlPositionReturnPct } from './adminHlLivePositions';

describe('adminHlLivePositions', () => {
  it('prefers HL unrealized PnL path via display (roe uses marginUsed)', () => {
    const hlUpnl = -1.11173;
    const marginUsed = 34.218943;
    const roe = hlPositionReturnPct(hlUpnl, marginUsed, 1329.42, 40);
    expect(roe).not.toBeNull();
    expect(roe!).toBeCloseTo((hlUpnl / marginUsed) * 100, 2);
  });

  it('falls back to notional/leverage for ROE when margin missing', () => {
    const upnl = -0.97;
    const roe = hlPositionReturnPct(upnl, null, 1329, 40);
    expect(roe!).toBeCloseTo((upnl / (1329 / 40)) * 100, 2);
  });

  it('mark-based uPnL matches manual calc', () => {
    const szi = 0.02203;
    const entry = 60295.5;
    const mark = 60251.5;
    const pnl = adminLivePositionPnl(szi, entry, mark, 0);
    expect(pnl).toBeCloseTo(-0.9693, 3);
  });
});