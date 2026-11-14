import { useEffect } from 'react';
import type { TradePanelTab } from './tradePanelTypes';
import { useBotTerminalAnalysisOptional } from '../../contexts/BotTerminalAnalysisContext';

/** Wires the right-hand Agent panel tab switcher to “Open analysis”. */
export function BotPanelTabBridge({
  panelTab,
  setPanelTab,
}: {
  panelTab: TradePanelTab;
  setPanelTab: (tab: TradePanelTab) => void;
}) {
  const ctx = useBotTerminalAnalysisOptional();
  useEffect(() => {
    if (!ctx) return;
    ctx.registerOpenAnalysisTab(() => setPanelTab('analysis'));
  }, [ctx, setPanelTab]);
  void panelTab;
  return null;
}

export default BotPanelTabBridge;