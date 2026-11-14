import { useEffect } from 'react';
import { useBotAnalysisActionsOptional } from '../../contexts/BotTerminalAnalysisContext';

/** Wires dock “Open analysis” to the Agent panel analytic view. */
export function BotPanelTabBridge({
  onOpenAnalytic,
}: {
  onOpenAnalytic: () => void;
}) {
  const registerOpen = useBotAnalysisActionsOptional()?.registerOpenAnalysisTab;
  useEffect(() => {
    if (!registerOpen) return;
    registerOpen(onOpenAnalytic);
  }, [registerOpen, onOpenAnalytic]);
  return null;
}

export default BotPanelTabBridge;