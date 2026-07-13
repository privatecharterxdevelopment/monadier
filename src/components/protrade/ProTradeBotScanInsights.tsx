import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useHlBotRunning } from '../../hooks/useHlBotRunning';
import { usePlatformFeeGate } from '../../contexts/PlatformFeeContext';
import { HL_DEFAULT_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import { resolveBotAnalysisWhyLine } from '../../lib/botAnalysisDisplay';
import { isBotScanNoiseDetail } from '../../lib/hlBotReasonLabels';
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
  botRunning: _botRunningProp,
}) => {
  const platformFees = usePlatformFeeGate();
  const hlSetup = useHlBotSetup(vaultWallet ?? undefined);
  const { settings: botSettings } = useTerminalBotSettings();
  const { botRunning: resolvedRunning } = useHlBotRunning({
    metricsAutoTrade: metrics.autoTradeEnabled,
  });
  const hasWallet = walletConnected || Boolean(vaultWallet);
  const botRunning = resolvedRunning;
  const feeGateActive = platformFees.botTradingBlocked;

  const hlBalanceUsd =
    hlSetup.accountUsd > 0 || !hlSetup.loading ? hlSetup.accountUsd : metrics.hlBalanceUsd;

  const botOpenCount = openPositionCoins.length;
  const slotOpenCount =
    botOpenCount > 0 ? botOpenCount : metrics.openPositionsCount;
  const maxSlots =
    botSettings.maxConcurrentPositions >= 3
      ? 3
      : botSettings.maxConcurrentPositions >= 2
        ? 2
        : HL_DEFAULT_CONCURRENT_POSITIONS;

  const analysis = useTerminalBotAnalysis({
    walletConnected: hasWallet,
    metrics,
    openPositionsCount: slotOpenCount,
    maxConcurrentPositions: maxSlots,
    vaultUsd: Math.max(hlBalanceUsd, hlSetup.perpUsd, hlSetup.spotUsdcUsd),
    vaultWallet,
    openPositionCoins,
    symbol,
    analysisActive: hasWallet && botRunning && !feeGateActive,
    botRunning,
    hlBotStrategy: botSettings.hlBotStrategy,
  });

  const primaryLine = useMemo(() => {
    if (!botRunning) return 'Press Start bot to scan markets';

    const detail = analysis.readiness?.detail?.trim();
    if (detail && !isBotScanNoiseDetail(detail)) return detail;

    const hasTfConflict = Boolean(
      analysis.signal?.warnings?.some((w) => /conflict/i.test(w))
    );
    const why = resolveBotAnalysisWhyLine({
      globalBest: analysis.scanCandidate ?? analysis.globalBest,
      readiness: analysis.readiness,
      hasTfConflict,
      openPositionsCount: slotOpenCount,
      maxConcurrentPositions: analysis.maxConcurrentPositions || maxSlots,
      signal: analysis.signal,
      scanningCoin: analysis.currentlyScanningCoin,
    });
    if (why) return why;

    const headline = analysis.readiness?.headline?.trim();
    if (headline && headline !== 'Scanning markets') return headline;

    if (analysis.globalCoinsScanned > 0) {
      return `Scanned ${analysis.globalCoinsScanned} HL perps — ${analysis.globalScanCount} tradeable setup(s)`;
    }

    if (analysis.currentlyScanningCoin) {
      return `Rotating scan: ${analysis.currentlyScanningCoin}…`;
    }

    return 'Scanning all HL perps for MTF alignment…';
  }, [
    botRunning,
    analysis.globalBest,
    analysis.scanCandidate,
    analysis.readiness,
    analysis.signal,
    analysis.currentlyScanningCoin,
    analysis.globalCoinsScanned,
    analysis.globalScanCount,
    slotOpenCount,
    maxSlots,
    analysis.maxConcurrentPositions,
  ]);

  if (!botRunning) {
    return (
      <>
        <div className="hl-dock-bot-scan-row">
          <span className="hl-dock-bot-scan-title">Bot off</span>
        </div>
        <div className="hl-dock-bot-scan-insights" role="status">
          <p className="hl-dock-bot-scan-detail">{primaryLine}</p>
        </div>
      </>
    );
  }

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

  const showSpinner = analysis.analyzerActive && !analysis.slotsFull;
  const scanTitle = analysis.slotsFull
    ? analysis.readiness.headline
    : analysis.readiness.headline || 'Bot is reading market…';

  return (
    <>
      <div className="hl-dock-bot-scan-row">
        {showSpinner ? (
          <Loader2 size={14} className="hl-dock-bot-scan-loader animate-spin" aria-hidden />
        ) : null}
        <span className="hl-dock-bot-scan-title">{scanTitle}</span>
      </div>
      <div className="hl-dock-bot-scan-insights" aria-live="polite">
        {primaryLine ? (
          <p className="hl-dock-bot-scan-detail">{primaryLine}</p>
        ) : null}
      </div>
    </>
  );
};

export default ProTradeBotScanInsights;
