import type { BotReadiness } from './botReadiness';

type GlobalBest = {
  coin: string;
  direction: string;
  confidence: number;
  reason?: string;
} | null;

type WhyLineInput = {
  globalBest?: GlobalBest;
  readiness?: BotReadiness;
  hasTfConflict: boolean;
  openPositionsCount: number;
  maxConcurrentPositions: number;
  /** BTC/ETH pump apex + turnaround lines from bot-status. */
  pumpSweepLines?: string[];
};

/** Primary analyzer subline — hidden; users see calm status only. */
export function resolveBotAnalysisWhyLine(_input: WhyLineInput): string | null {
  return null;
}

/** User-facing insight lines for the positions dock scan panel. */
export function collectBotScanInsightLines(_input: WhyLineInput): string[] {
  return [];
}
