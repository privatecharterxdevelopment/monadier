import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getExecutionDiagnostic,
  markGatePassed,
  patchExecutionDiagnostic,
} from './executionDiagnostics';

describe('executionDiagnostics', () => {
  it('never claims emergency SL confirmed without an explicit patch', () => {
    const wallet = '0xabc';
    patchExecutionDiagnostic(wallet, {
      coin: 'BTC',
      direction: 'SHORT',
      scan: 'standard',
      scanPassed: true,
      orderSent: true,
      fillConfirmed: true,
    });
    markGatePassed(wallet, 'macro_beta');
    const d = getExecutionDiagnostic(wallet);
    assert.equal(d?.emergencySlConfirmed, false);
    assert.ok(d?.gatesPassed.includes('macro_beta'));
    patchExecutionDiagnostic(wallet, { emergencySlConfirmed: true, emergencySlPx: 108_000 });
    assert.equal(getExecutionDiagnostic(wallet)?.emergencySlConfirmed, true);
  });
});
