import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Mirror of hlInfo.hlSummaryAccountValueUsd — must stay in sync. */
function hlAccountValueUsd(state: {
  marginSummary?: { accountValue?: string; totalRawUsd?: string };
  crossMarginSummary?: { accountValue?: string; totalRawUsd?: string };
} | null): number {
  const margin = Number(state?.marginSummary?.accountValue ?? 0);
  const cross = Number(state?.crossMarginSummary?.accountValue ?? 0);
  const values = [margin, cross].filter((n) => Number.isFinite(n) && n > 0);
  return values.length > 0 ? Math.max(...values) : 0;
}

describe('hlAccountValueUsd', () => {
  it('uses accountValue, not totalRawUsd (isolated margin must not inflate balance)', () => {
    const state = {
      marginSummary: {
        accountValue: '68.441968',
        totalRawUsd: '273.51025',
      },
      crossMarginSummary: {
        accountValue: '0.0',
        totalRawUsd: '0.0',
      },
    };
    assert.equal(hlAccountValueUsd(state), 68.441968);
  });
});
