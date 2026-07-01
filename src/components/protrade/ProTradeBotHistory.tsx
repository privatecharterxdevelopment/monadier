import React, { useCallback, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useHyperliquidAccount } from '../../hooks/useHyperliquidAccount';
import { useHlBotManagedCoins } from '../../hooks/useHlBotManagedCoins';
import { exportBotTradesPdf } from '../../lib/exportBotTradesPdf';
import { fmtClosedPnl, fmtTradingSince, fmtUsdSymbol, isHlFillOpen } from '../../lib/hyperliquid/format';
import { summarizeHlClosedPnlFromFills } from '../../lib/hyperliquid/hlPnl';
import { toNum } from '../../lib/hyperliquid/parse';
import { filterHlPositions } from '../../lib/hyperliquid/splitHlPositions';
import { displayHandle } from '../../lib/username';
import ProTradeHlBotDock from './ProTradeHlBotDock';

type Props = {
  refreshKey?: number;
  walletAddress?: string | null;
  walletConnected?: boolean;
  /** Rendered inside Profile → Bot trades (no standalone page chrome). */
  embedded?: boolean;
};

const ProTradeBotHistory: React.FC<Props> = ({
  refreshKey = 0,
  walletAddress,
  walletConnected = false,
  embedded = false,
}) => {
  const { user, profile } = useAuth();
  const displayName = displayHandle(profile, user?.email);
  const username = profile?.username?.trim() || null;
  const userId = user?.id ?? null;
  const wallet = walletAddress?.trim() || undefined;
  const { account, fills, fillsLoading } = useHyperliquidAccount(wallet);
  const { coins: botManagedCoins } = useHlBotManagedCoins(wallet, refreshKey + fills.length);

  const closeFills = useMemo(
    () => fills.filter((f) => !isHlFillOpen(f.dir)),
    [fills]
  );

  const pnlSummary = useMemo(() => summarizeHlClosedPnlFromFills(fills), [fills]);

  const botPositions = useMemo(
    () => filterHlPositions(account?.positions, botManagedCoins, 'bot'),
    [account?.positions, botManagedCoins]
  );

  const activeUpnl = useMemo(
    () => botPositions.reduce((sum, p) => sum + toNum(p.unrealizedPnl), 0),
    [botPositions]
  );

  const tradingSinceMs = useMemo(() => {
    if (pnlSummary.firstFillAt != null) return pnlSummary.firstFillAt;
    const created = profile?.created_at;
    if (typeof created === 'string' && created.trim()) {
      const ts = Date.parse(created);
      if (Number.isFinite(ts)) return ts;
    }
    return null;
  }, [pnlSummary.firstFillAt, profile?.created_at]);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleDownloadPdf = useCallback(async () => {
    if (!wallet || closeFills.length === 0 || exporting) return;
    setExportError(null);
    setExporting(true);
    try {
      await exportBotTradesPdf({
        fills,
        walletAddress: wallet,
        userId,
        username,
        displayName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF export failed.';
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  }, [wallet, closeFills.length, exporting, fills, userId, username, displayName]);

  const showPdfExport = embedded && Boolean(wallet) && closeFills.length > 0;
  const accountLine = username ? `@${username}` : displayName;
  const showOverview = Boolean(wallet);

  return (
    <div className={`hl-history-page${embedded ? ' hl-history-page--embedded' : ''}`}>
      <header className="hl-history-head">
        <div className="hl-history-head-row">
          <div className="hl-history-head-main">
            <h1 className="hl-history-title">Bot trade history</h1>
            <p className="hl-history-sub">
              Hyperliquid perps — fills and closed P/L from your HL account.
            </p>
            {embedded && (accountLine || userId) ? (
              <p className="hl-history-meta">
                {accountLine ? <span>Account: {accountLine}</span> : null}
                {accountLine && userId ? <span className="hl-history-meta-sep">·</span> : null}
                {userId ? <span>User ID: {userId}</span> : null}
              </p>
            ) : null}
          </div>

          {showOverview ? (
            <div className="hl-history-overview" aria-label="Bot trading totals">
              <div className="hl-history-overview-card">
                <span className="hl-history-overview-label">Total gain</span>
                <span className="hl-history-overview-value hl-up">
                  {fillsLoading && pnlSummary.closedCount === 0
                    ? '…'
                    : fmtUsdSymbol(pnlSummary.totalGain)}
                </span>
              </div>
              <div className="hl-history-overview-card">
                <span className="hl-history-overview-label">Total loss</span>
                <span className="hl-history-overview-value hl-down">
                  {fillsLoading && pnlSummary.closedCount === 0
                    ? '…'
                    : fmtUsdSymbol(Math.abs(pnlSummary.totalLoss))}
                </span>
              </div>
              <div className="hl-history-overview-card">
                <span className="hl-history-overview-label">Timeline</span>
                <span className="hl-history-overview-value hl-history-overview-value--sm">
                  {fillsLoading && tradingSinceMs == null
                    ? '…'
                    : fmtTradingSince(tradingSinceMs)}
                </span>
              </div>
              <div className="hl-history-overview-card">
                <span className="hl-history-overview-label">Active uPnL</span>
                <span
                  className={`hl-history-overview-value ${
                    activeUpnl >= 0 ? 'hl-up' : 'hl-down'
                  }`}
                >
                  {account == null && fillsLoading ? '…' : fmtClosedPnl(activeUpnl)}
                </span>
                {botPositions.length > 0 ? (
                  <span className="hl-history-overview-sub">
                    {botPositions.length} open position{botPositions.length === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {showPdfExport ? (
            <div className="hl-history-pdf-wrap">
              <button
                type="button"
                className="hl-history-pdf-btn"
                onClick={() => void handleDownloadPdf()}
                disabled={exporting}
                aria-label="Download bot trade history as PDF"
              >
                <Download size={14} aria-hidden />
                {exporting ? 'Exporting…' : 'Download PDF'}
              </button>
              {exportError ? (
                <p className="hl-history-pdf-error" role="alert">
                  {exportError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      <div className="hl-history-body hl-bot-dock">
        <ProTradeHlBotDock
          activeTab="tradeHistory"
          refreshKey={refreshKey}
          walletAddress={walletAddress}
          walletConnected={walletConnected}
          historyOnly
        />
      </div>
    </div>
  );
};

export default ProTradeBotHistory;
