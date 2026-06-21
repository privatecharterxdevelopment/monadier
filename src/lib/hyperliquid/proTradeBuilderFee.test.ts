import { describe, expect, it } from 'vitest';
import { parseMaxBuilderTenthsBps } from './proTradeBuilderFee';
import { resolveOutcomeBuilderParam } from './outcomes/builderFee';

describe('parseMaxBuilderTenthsBps', () => {
  it('parses 0.1% for bot success fee cap', () => {
    expect(parseMaxBuilderTenthsBps('0.1%')).toBe(100);
  });

  it('parses 2.5% for betting cashout cap (not clamped to 0.1%)', () => {
    expect(parseMaxBuilderTenthsBps('2.5%')).toBe(2500);
  });

  it('parses 0.5% for betting buy', () => {
    expect(parseMaxBuilderTenthsBps('0.5%')).toBe(500);
  });
});

describe('resolveOutcomeBuilderParam', () => {
  it('returns cashout fee when user approved 2.5%', () => {
    const param = resolveOutcomeBuilderParam({
      orderSide: 'sell',
      approvedMaxTenthsBps: 2500,
    });
    expect(param).not.toBeNull();
    expect(param?.f).toBe(2500);
  });

  it('returns buy fee when user approved 0.5%', () => {
    const param = resolveOutcomeBuilderParam({
      orderSide: 'buy',
      approvedMaxTenthsBps: 500,
    });
    expect(param).not.toBeNull();
    expect(param?.f).toBe(500);
  });
});
