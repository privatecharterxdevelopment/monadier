import { describe, expect, it } from 'vitest';
import { pickFreshOpenBlock } from './hlOpenBlockDisplay';

describe('pickFreshOpenBlock', () => {
  const blocks = [
    {
      coin: 'BNB',
      reason: 'volume fade',
      gate: 'liquidity',
      at: Date.now(),
    },
    {
      coin: 'BTC',
      reason: 'scalp misalign',
      gate: 'scalp',
      at: Date.now() - 1000,
    },
  ];

  it('returns matching coin only when want is set', () => {
    expect(pickFreshOpenBlock(blocks, 'BTC')?.coin).toBe('BTC');
    expect(pickFreshOpenBlock(blocks, 'ETH')).toBeNull();
  });

  it('returns freshest block when want is omitted', () => {
    expect(pickFreshOpenBlock(blocks)?.coin).toBe('BNB');
  });
});
