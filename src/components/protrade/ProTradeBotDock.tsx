import React from 'react';
import ProTradeHlBotDock, {
  type HlBotDockTab,
  normalizeHlBotDockTab,
} from './ProTradeHlBotDock';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';

export type { HlBotDockTab };
export { normalizeHlBotDockTab };

type Props = {
  activeTab: HlBotDockTab | string;
  onTabChange: (tab: HlBotDockTab) => void;
  refreshKey?: number;
  showBotAnalysis?: boolean;
  botAnalysisMetrics?: Dashboard2Metrics;
  botAnalysisWallet?: string | null;
  botAnalysisSymbol?: string;
  walletConnected?: boolean;
  onPositionChange?: () => void;
  onCoinClick?: (coin: string) => void;
  walletAddress?: string | null;
};

/** Hyperliquid bot dock — Pro Trade desk layout, no GMX/vault. */
const ProTradeBotDock: React.FC<Props> = (props) => <ProTradeHlBotDock {...props} />;

export default ProTradeBotDock;
