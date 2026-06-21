import React, { useMemo } from 'react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { HL_MAX_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import { isHlBotEnabled } from '../../lib/hlBotGates';
import { normalizeHlPerpCoin } from '../../lib/botTradingPairs';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import TerminalChartAnalysisOverlay from '../terminal/TerminalChartAnalysisOverlay';

type Props = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  vaultWallet?: string | null;
  /** Chart pair fallback when global scan has no candidate yet. */
  symbol?: string;
  openPositionCoins?: string[];
  botRunning?: boolean;
};

/** Scan pills + context under “Bot is reading market…” — shows the pair the bot is analyzing. */
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

  const activeCandidate = analysis.scanCandidate ?? analysis.globalBest;
  const hasBestCandidate = Boolean(activeCandidate?.coin);
  const scanned =
    analysis.globalCoinsScanned > 0 ? analysis.globalCoinsScanned : analysis.scanRotationCoins.length;

  const universeLine = useMemo(() => {
    if (hasBestCandidate && activeCandidate) {
      const c = normalizeHlPerpCoin(activeCandidate.coin);
      const conf = Math.round(activeCandidate.confidence);
      return `Scanned ${scanned} HL perps · best setup ${c} ${activeCandidate.direction} ${conf}% · deep MTF check`;
    }
    const idx =
      analysis.scanRotationCoins.indexOf(analysis.currentlyScanningCoin) + 1 ||
      (analysis.step % analysis.scanRotationCoins.length) + 1;
    return `Scanning ${scanned} HL perps · checking ${analysis.currentlyScanningCoin} (${idx}/${analysis.scanRotationCoins.length})`;
  }, [
    activeCandidate,
    analysis.currentlyScanningCoin,
    analysis.scanRotationCoins,
    analysis.step,
    hasBestCandidate,
    scanned,
  ]);

  const scanHeadline = hasBestCandidate
    ? analysis.readiness.headline
    : `Checking ${analysis.currentlyScanningCoin}`;

  const slotsFull = metrics.openPositionsCount >= HL_MAX_CONCURRENT_POSITIONS;

  return (
    <div className="hl-dock-bot-scan-live" aria-live="polite">
      <p className="hl-dock-bot-scan-universe">{universeLine}</p>
      <TerminalChartAnalysisOverlay
        placement="dock"
        visible
        step={analysis.step}
        progress={analysis.progress}
        signal={hasBestCandidate ? analysis.signal : null}
        dbAnalysis={hasBestCandidate ? analysis.dbAnalysis : null}
        activeSymbol={analysis.activeSymbol ?? symbol}
        globalBest={activeCandidate}
        globalScanCount={analysis.globalScanCount}
        globalCoinsScanned={analysis.globalCoinsScanned}
        readiness={{
          ...(slotsFull
            ? {
                ...analysis.readiness,
                headline: 'Slots full',
                detail: `${metrics.openPositionsCount}/${HL_MAX_CONCURRENT_POSITIONS} open — monitoring exits`,
              }
            : analysis.readiness),
          headline: scanHeadline,
        }}
        scanning={botRunning && (analysis.scanning || metrics.openPositionsCount === 0)}
        isLoading={hasBestCandidate ? analysis.isLoading : false}
        openPositionsCount={metrics.openPositionsCount}
        maxConcurrentPositions={HL_MAX_CONCURRENT_POSITIONS}
      />
    </div>
  );
};

export default ProTradeBotScanInsights;
