import { useEffect } from 'react';
import { useBotTerminalAnalysisOptional } from '../../contexts/BotTerminalAnalysisContext';

/** Wires dock “Open analysis” to the Agent panel analytic view. */
export function BotPanelTabBridge({
  onOpenAnalytic,
}: {
  onOpenAnalytic: () => void;
}) {
  const ctx = useBotTerminalAnalysisOptional();
  useEffect(() => {
    if (!ctx) return;
    ctx.registerOpenAnalysisTab(onOpenAnalytic);
  }, [ctx, onOpenAnalytic]);
  return null;
}

export default BotPanelTabBridge;