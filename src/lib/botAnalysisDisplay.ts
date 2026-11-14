import { isActionableBotScanDetail, isBotScanNoiseDetail } from './hlBotReasonLabels';
type WhyLineInput = {
  entryWaitReason?: string | null;
};

/** Verbose engine/scan copy — suppressed in the dock; use pills/title only. */
export function resolveBotAnalysisWhyLine({
  entryWaitReason,
}: WhyLineInput): string | null {
  const wait = entryWaitReason?.trim();
  if (wait && isActionableBotScanDetail(wait) && !isBotScanNoiseDetail(wait)) return wait;
  return null;
}

