import React from 'react';
import { Activity } from 'lucide-react';
import { useBotTerminalAnalysis } from '../../contexts/BotTerminalAnalysisContext';
import ProTradeScanCyclePanel from '../protrade/ProTradeScanCyclePanel';
import { formatJournalTime } from '../../lib/botAnalysisJournal';

const TerminalBotAnalysisPanel: React.FC = () => {
  const analysis = useBotTerminalAnalysis();
  const {
    liveNarrative,
    journalHistory,
    botRunning,
    currentlyScanningCoin,
    scanUniverseCoins,
    boardCandidates,
    globalCandidates,
    scanSkips,
    openPositionsCount,
    globalCoinsScanned,
    scanScannedAt,
    scanComplete,
    scanning,
  } = analysis;

  const candidates = [...(boardCandidates ?? []), ...(globalCandidates ?? [])].map((c) => ({
    coin: c.coin,
    direction: c.direction,
    confidence: c.confidence,
  }));

  const lines = liveNarrative.split('\n').filter(Boolean);

  return (
    <div className="term-bot-analysis-panel">
      <motionHeader botRunning={botRunning} scanning={scanning} coin={currentlyScanningCoin} />

      <div className="term-bot-analysis-live">
        <h3 className="term-bot-analysis-section-title">Live</h3>
        {lines.length > 0 ? (
          <ul className="term-bot-analysis-lines">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="term-hint">Badges under the chart update every scan cycle. Narrative appears here when the engine reports blockers or candidates.</p>
        )}
      </div>

      <ProTradeScanCyclePanel
        universe={
          scanUniverseCoins?.length > 0 ? scanUniverseCoins : []
        }
        candidates={candidates}
        skips={scanSkips}
        openCoins={[]}
        currentlyScanning={currentlyScanningCoin}
        scannedAt={scanScannedAt}
        coinsScanned={globalCoinsScanned}
        scanComplete={scanComplete}
      />

      <div className="term-bot-analysis-history">
        <h3 className="term-bot-analysis-section-title">Last 10 minutes</h3>
        {journalHistory.length === 0 ? (
          <p className="term-hint">No journal entries yet — start the agent to record scan updates.</p>
        ) : (
          <ul className="term-bot-analysis-journal">
            {[...journalHistory].reverse().map((entry) => (
              <li key={`${entry.at}-${entry.detail.slice(0, 40)}`} className="term-bot-analysis-journal-item">
                <div className="term-bot-analysis-journal-head">
                  <time dateTime={new Date(entry.at).toISOString()}>{formatJournalTime(entry.at)}</time>
                  <span className="term-bot-analysis-journal-verdict">{entry.verdict}</span>
                  {entry.coin ? (
                    <span className="term-bot-analysis-journal-coin">{entry.coin.toUpperCase()}</span>
                  ) : null}
                </div>
                <p className="term-bot-analysis-journal-body">{entry.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {openPositionsCount > 0 ? (
        <p className="term-hint term-bot-analysis-foot">
          Managing {openPositionsCount} open trade{openPositionsCount === 1 ? '' : 's'} — opens still logged here when slots are free.
        </p>
      ) : null}
    </div>
  );
};

function motionHeader({
  botRunning,
  scanning,
  coin,
}: {
  botRunning: boolean;
  scanning: boolean;
  coin?: string;
}) {
  return (
    <div className="term-bot-analysis-panel-head">
      {scanning ? (
        <Activity size={14} className="term-analysis-pulse" aria-hidden />
      ) : null}
      <span>
        {botRunning
          ? coin
            ? `Scanning ${coin.toUpperCase()}`
            : 'Agent scanning HL perps'
          : 'Agent paused — start to resume analysis log'}
      </span>
    </div>
  );
}

export default TerminalBotAnalysisPanel;