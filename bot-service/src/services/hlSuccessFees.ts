/** @deprecated — use platformFees.ts */
export {
  calculatePlatformSuccessFee as calculateHlSuccessFee,
  getPlatformFeeStatus as getHlFeeSummary,
  recordProfitableClose as recordHlBotClose,
  type ProfitableCloseInput,
} from './platformFees';

export type HlCloseSnapshot = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
  exitPx: number;
  size: number;
  leverage: number;
  unrealizedPnlUsd: number;
  collateralUsd: number;
};
