import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAltUniverseBlock } from './universeFilterSymmetry';
import { FUNNEL } from './pipelineFunnelReasons';

describe('universe filter symmetry', () => {
  it('risk_off blocks alt LONG only', () => {
    assert.equal(
      computeAltUniverseBlock({
        coin: 'SOL',
        direction: 'LONG',
        regime: 'risk_off',
        btcDirection: 'LONG',
        ethDirection: 'LONG',
        megaLongBlock: false,
        megaShortBlock: false,
      }),
      FUNNEL.universe.riskOff
    );
    assert.equal(
      computeAltUniverseBlock({
        coin: 'SOL',
        direction: 'SHORT',
        regime: 'risk_off',
        btcDirection: 'SHORT',
        ethDirection: 'SHORT',
        megaLongBlock: false,
        megaShortBlock: false,
      }),
      null
    );
  });

  it('risk_on blocks alt SHORT only', () => {
    assert.equal(
      computeAltUniverseBlock({
        coin: 'SOL',
        direction: 'SHORT',
        regime: 'risk_on',
        btcDirection: 'LONG',
        ethDirection: 'LONG',
        megaLongBlock: false,
        megaShortBlock: false,
      }),
      FUNNEL.universe.riskOn
    );
    assert.equal(
      computeAltUniverseBlock({
        coin: 'SOL',
        direction: 'LONG',
        regime: 'risk_on',
        btcDirection: 'LONG',
        ethDirection: 'LONG',
        megaLongBlock: false,
        megaShortBlock: false,
      }),
      null
    );
  });

  it('BTC/ETH scan direction blocks mirror for alts under neutral regime', () => {
    const longBlock = computeAltUniverseBlock({
      coin: 'SOL',
      direction: 'LONG',
      regime: 'neutral',
      btcDirection: 'SHORT',
      ethDirection: 'LONG',
      megaLongBlock: false,
      megaShortBlock: false,
    });
    const shortBlock = computeAltUniverseBlock({
      coin: 'SOL',
      direction: 'SHORT',
      regime: 'neutral',
      btcDirection: 'LONG',
      ethDirection: 'SHORT',
      megaLongBlock: false,
      megaShortBlock: false,
    });
    assert.equal(longBlock, FUNNEL.universe.btcShort);
    assert.equal(shortBlock, FUNNEL.universe.btcLong);
  });

  it('mega flow blocks mirror OUTFLOW/LONG vs INFLOW/SHORT', () => {
    assert.equal(
      computeAltUniverseBlock({
        coin: 'SOL',
        direction: 'LONG',
        regime: 'neutral',
        btcDirection: 'LONG',
        ethDirection: 'LONG',
        megaLongBlock: true,
        megaShortBlock: false,
      }),
      FUNNEL.universe.megaOutflow
    );
    assert.equal(
      computeAltUniverseBlock({
        coin: 'SOL',
        direction: 'SHORT',
        regime: 'neutral',
        btcDirection: 'SHORT',
        ethDirection: 'SHORT',
        megaLongBlock: false,
        megaShortBlock: true,
      }),
      FUNNEL.universe.megaInflow
    );
  });

  it('majors never blocked by alt universe rules', () => {
    assert.equal(
      computeAltUniverseBlock({
        coin: 'BTC',
        direction: 'LONG',
        regime: 'risk_off',
        btcDirection: 'SHORT',
        ethDirection: 'SHORT',
        megaLongBlock: true,
        megaShortBlock: true,
      }),
      null
    );
  });
});
