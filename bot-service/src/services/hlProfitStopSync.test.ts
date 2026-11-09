import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { profitStopSafeToPost, protectiveSideOk } from './hlProfitStopSync';

describe('profit SL must stay green', () => {
  it('rejects a SHORT trigger on the loss side of entry', () => {
    assert.equal(protectiveSideOk('SHORT', 86.8, 86.4, 86.45), false);
  });

  it('rejects a glue-to-mark SHORT stop (market fill would slip red)', () => {
    assert.equal(
      profitStopSafeToPost({
        direction: 'SHORT',
        stopPx: 86.44,
        markPx: 86.43,
        entryPx: 86.45,
        absSize: 5.25,
        minLockUsd: 1.25,
      }),
      false
    );
  });

  it('allows a SHORT stop with real lock below entry', () => {
    assert.equal(protectiveSideOk('SHORT', 85.8, 85.2, 86.45), true);
    assert.equal(
      profitStopSafeToPost({
        direction: 'SHORT',
        stopPx: 85.8,
        markPx: 85.2,
        entryPx: 86.45,
        absSize: 5.25,
        minLockUsd: 1.25,
      }),
      true
    );
  });
});
