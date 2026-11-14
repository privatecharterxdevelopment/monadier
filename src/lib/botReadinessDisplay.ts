import type { BotReadiness } from './botReadiness';
import { isActionableBotScanDetail } from './hlBotReasonLabels';

/** Strip scan/engine chatter from readiness copy shown in the dock analyzer. */
export function scrubBotReadinessForUi(readiness: BotReadiness): BotReadiness {
  const d = readiness.detail?.trim() ?? '';
  if (!d || !isActionableBotScanDetail(d)) {
    return { ...readiness, detail: '' };
  }
  return readiness;
}