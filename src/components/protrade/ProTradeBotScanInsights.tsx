import React, { useMemo } from 'react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { HL_MAX_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import { isHlBotEnabled } from '../../lib/hlBotGates';
import {
  binanceSymbolToHlCoin,
  normalizeHlPerpCoin,
} from '../../lib/botTradingPairs';
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

  const analyzedCoin = useMemo(() => {
    if (activeCandidate?.coin) return normalizeHlPerpCoin(activeCandidate.coin);
    if (analysis.activeSymbol) return binanceSymbolToHlCoin(analysis.activeSymbol);
    return binanceSymbolToHlCoin(symbol);
  }, [activeCandidate?.coin, analysis.activeSymbol, symbol]);

  const universeLine = useMemo(() => {
    const scanned =
      analysis.globalCoinsScanned > 0 ? analysis.globalCoinsScanned : 18;
    if (activeCandidate?.coin) {
      const c = normalizeHlPerpCoin(activeCandidate.coin);
      const conf = Math.round(activeCandidate.confidence);
      return `Scanned ${scanned} HL perps · analyzing ${c} ${activeCandidate.direction} ${conf}%`;
    }
    return `Scanning ${scanned} HL perps · MTF check on ${analyzedCoin} (chart)`;
  }, [
    activeCandidate,
    analysis.globalCoinsScanned,
    analyzedCoin,
  ]);

  const slotsFull = metrics.openPositionsCount >= HL_MAX_CONCURRENT_POSITIONS;

  return (
    <div className="hl-dock-bot-scan-live" aria-live="polite">
      <p className="hl-dock-bot-scan-universe">{universeLine}</p>
      <TerminalChartAnalysisOverlay
        placement="dock"
        visible
        step={analysis.step}
        progress={analysis.progress}
        signal={analysis.signal}
        dbAnalysis={analysis.dbAnalysis}
        activeSymbol={analysis.activeSymbol ?? symbol}
        globalBest={activeCandidate}
        globalScanCount={analysis.globalScanCount}
        globalCoinsScanned={analysis.globalCoinsScanned}
        readiness={
          slotsFull
            ? {
                ...analysis.readiness,
                headline: 'Slots full',
                detail: `${metrics.openPositionsCount}/${HL_MAX_CONCURRENT_POSITIONS} open — monitoring exits`,
              }
            : analysis.readiness
        }
        scanning={botRunning && (analysis.scanning || metrics.openPositionsCount === 0)}
        isLoading={analysis.isLoading}
        openPositionsCount={metrics.openPositionsCount}
        maxConcurrentPositions={HL_MAX_CONCURRENT_POSITIONS}
      />
    </div>
  );
};

export default ProTradeBotScanInsights;
