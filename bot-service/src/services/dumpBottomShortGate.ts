/**
 * Dump-bottom SHORT block retired — shorts must stay free.
 * Prefer-LONG after dumps lives in preferLongAfterDump.ts (LONG boost only).
 */
export type DumpBottomShortResult = {
  ok: boolean;
  reason: string;
};

export async function validateNoDumpBottomShort(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<DumpBottomShortResult> {
  return {
    ok: true,
    reason:
      opts.direction === 'SHORT'
        ? `SHORT ok ${opts.coin.toUpperCase()} — dump-bottom short block disabled`
        : 'Dump-bottom gate inactive for LONG',
  };
}
