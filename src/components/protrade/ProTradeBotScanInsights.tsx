import React, { useMemo } from 'react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useHlBotRunning } from '../../hooks/useHlBotRunning';
import { usePlatformFeeGate } from '../../contexts/PlatformFeeContext';
import { HL_MAX_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import { collectBotScanInsightLines } from '../../lib/botAnalysisDisplay';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';

type Props = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  vaultWallet?: string | null;
  symbol?: string;
  openPositionCoins?: string[];
  botRunning?: boolean;
};

/** Text-only insights under “Bot is reading market…” (pills stay under chart). */
const ProTradeBotScanInsights: React.FC<Props> = ({
  walletConnected,
  metrics,
  vaultWallet,
  symbol = 'BTCUSDT',
  openPositionCoins = [],
  botRunning: botRunningProp,
}) => {
  const platformFees = usePlatformFeeGate();
  const hlSetup = useHlBotSetup(vaultWallet ?? undefined);
  const { settings: botSettings } = useTerminalBotSettings();
  const { botRunning: resolvedRunning } = useHlBotRunning({
    metricsAutoTrade: metrics.autoTradeEnabled,
  });
  const hasWallet = walletConnected || Boolean(vaultWallet);
  const botRunning = botRunningProp ?? resolvedRunning;
  const feeGateActive = platformFees.botTradingBlocked;

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
    analysisActive: hasWallet && botRunning && !feeGateActive,
    botRunning,
    hlBotStrategy: botSettings.hlBotStrategy,
  });

  const insightLines = useMemo(() => {
    const hasTfConflict = Boolean(
      analysis.signal?.warnings?.some((w) => /conflict/i.test(w))
    );
    const lines = collectBotScanInsightLines({
      globalBest: analysis.scanCandidate ?? analysis.globalBest,
      readiness: analysis.readiness,
      hasTfConflict,
      openPositionsCount: metrics.openPositionsCount,
      maxConcurrentPositions: HL_MAX_CONCURRENT_POSITIONS,
      pumpSweepLines: analysis.pumpSweepLines,
      signal: analysis.signal,
      scanningCoin: analysis.currentlyScanningCoin,
    });

    if (lines.length > 0) return lines;

    const detail = analysis.readiness?.detail?.trim();
    if (detail) return [detail];

    const headline = analysis.readiness?.headline?.trim();
    if (headline && headline !== 'Scanning markets') return [headline];

    if (analysis.globalCoinsScanned > 0) {
      return [
        `Scanned ${analysis.globalCoinsScanned} HL perps — ${analysis.globalScanCount} tradeable setup(s)`,
      ];
    }

    if (analysis.currentlyScanningCoin) {
      return [`Rotating scan: ${analysis.currentlyScanningCoin}…`];
    }

    return ['Scanning all HL perps for MTF alignment…'];
  }, [
    analysis.globalBest,
    analysis.scanCandidate,
    analysis.readiness,
    analysis.signal,
    analysis.pumpSweepLines,
    analysis.currentlyScanningCoin,
    analysis.globalCoinsScanned,
    analysis.globalScanCount,
    metrics.openPositionsCount,
  ]);

  if (feeGateActive) {
    return (
      <div className="hl-dock-bot-scan-insights" role="status">
        <p className="hl-dock-bot-scan-detail">
          Bot fees due — pay {fmtUsdSymbol(platformFees.accruedUsd)} to resume scanning (
          {platformFees.successWinCount}/{platformFees.winsBeforeBlock} wins).
        </p>
      </div>
    );
  }

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
