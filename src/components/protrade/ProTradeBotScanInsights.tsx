import React, { useMemo } from 'react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { HL_MAX_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import { isHlBotEnabled } from '../../lib/hlBotGates';
import { collectBotScanInsightLines } from '../../lib/botAnalysisDisplay';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';

type Props = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  vaultWallet?: string | null;
  symbol?: string;
  openPositionCoins?: string[];
  botRunning?: boolean;
};

/** Live scan insights below “Bot is reading market…” in the positions dock. */
const ProTradeBotScanInsights: React.FC<Props> = ({
  walletConnected,
  metrics,
  vaultWallet,
  symbol = 'BTCUSDT',
  openPositionCoins = [],
  botRunning: botRunningProp,
}) => {
  const hlSetup = useHlBotSetup(vaultWallet ?? undefined);
  const botSettings = useTerminalBotSettings();
  const hasWallet = walletConnected || Boolean(vaultWallet);
  const botRunning = isHlBotEnabled(
    botRunningProp ??
      (botSettings.settings.autoTradeEnabled || metrics.autoTradeEnabled)
  );

  const hlBalanceUsd =
    hlSetup.accountUsd > 0 || !hlSetup.loading ? hlSetup.accountUsd : metrics.hlBalanceUsd;

  const analysis = useTerminalBotAnalysis({
    walletConnected: hasWallet,
    metrics,
    openPositionsCount: metrics.openPositionsCount,
    maxConcurrentPositions: HL_MAX_CONCURRENT_POSITIONS,
    vaultUsd: hlBalanceUsd,
    vaultWallet,
    openPositionCoins,
    symbol,
    analysisActive: hasWallet && botRunning,
    botRunning,
  });

  const insightLines = useMemo(() => {
    const hasTfConflict = Boolean(
      analysis.signal?.warnings?.some((w) => /conflict/i.test(w))
    );
    return collectBotScanInsightLines({
      globalBest: analysis.scanCandidate ?? analysis.globalBest,
      readiness: analysis.readiness,
      hasTfConflict,
      openPositionsCount: metrics.openPositionsCount,
      maxConcurrentPositions: HL_MAX_CONCURRENT_POSITIONS,
    });
  }, [
    analysis.globalBest,
    analysis.scanCandidate,
    analysis.readiness,
    analysis.signal?.warnings,
    metrics.openPositionsCount,
  ]);

  if (insightLines.length === 0) return null;

  return (
    <div className="hl-dock-bot-scan-insights" aria-live="polite">
      {insightLines.map((line) => (
        <p key={line} className="hl-dock-bot-scan-detail">
          {line}
        </p>
      ))}
    </div>
  );
};

export default ProTradeBotScanInsights;
