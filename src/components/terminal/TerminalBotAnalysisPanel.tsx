import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { useBotTerminalAnalysis } from '../../contexts/BotTerminalAnalysisContext';
import ProTradeScanCyclePanel from '../protrade/ProTradeScanCyclePanel';
import { formatJournalTime } from '../../lib/botAnalysisJournal';
import {
  executionHeadline,
  formatExecutionDiagnosticLine,
} from '../../lib/hlExecutionDisplay';

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
    execution,
    executionDiagnostic,
    scanCandidate,
    globalBest,
  } = analysis;

  const candidates = [...(boardCandidates ?? []), ...(globalCandidates ?? [])].map((c) => ({
    coin: c.coin,
    direction: c.direction,
    confidence: c.confidence,
  }));

  const lines = liveNarrative.split('\n').filter(Boolean);

  const pipeline = useMemo(() => {
    const headline = executionHeadline(execution);
    const diagLine = formatExecutionDiagnosticLine(executionDiagnostic);
    const focus = scanCandidate ?? globalBest;
    return {
      headline,
      diagLine,
      focusCoin: focus?.coin?.toUpperCase(),
      focusDir: focus?.direction?.toUpperCase(),
      focusConf: focus ? Math.round(focus.confidence) : null,
      focusReason: focus?.reason?.trim(),
      scanPassed: executionDiagnostic?.scanPassed,
      gates: executionDiagnostic?.gatesPassed ?? [],
      blockedBy: executionDiagnostic?.blockedBy,
      blockedReason: executionDiagnostic?.blockedReason,
      orderSent: executionDiagnostic?.orderSent,
      fillConfirmed: executionDiagnostic?.fillConfirmed,
      execReason: execution?.reason?.trim(),
    };
  }, [execution, executionDiagnostic, scanCandidate, globalBest]);

  const opening =
    pipeline.orderSent ||
    pipeline.fillConfirmed ||
    headlineIsOpening(pipeline.headline);

  return (
    <div className="term-bot-analysis-panel">
      <motionHeader botRunning={botRunning} scanning={scanning} coin={currentlyScanningCoin} />

      <div className="term-bot-analysis-pipeline">
        <h3 className="term-bot-analysis-section-title">Engine</h3>
        <dl className="term-bot-analysis-pipeline-grid">
          <div>
            <dt>Status</dt>
            <dd className={opening ? 'term-pnl-pos' : pipeline.blockedBy ? 'term-pnl-neg' : ''}>
              {pipeline.headline ?? (botRunning ? 'Scanning' : 'Idle')}
            </dd>
          </div>
          {pipeline.focusCoin ? (
            <div>
              <dt>Focus</dt>
              <dd>
                {pipeline.focusCoin} {pipeline.focusDir} {pipeline.focusConf != null ? `${pipeline.focusConf}%` : ''}
              </dd>
            </div>
          ) : null}
          {pipeline.scanPassed === false ? (
            <div className="term-bot-analysis-pipeline-span">
              <dt>Scan</dt>
              <dd className="term-pnl-neg">Rejected — does not pass bot scan rules</dd>
            </div>
          ) : pipeline.scanPassed === true ? (
            <div className="term-bot-analysis-pipeline-span">
              <dt>Scan</dt>
              <dd className="term-pnl-pos">Accepted — candidate qualifies for gates</dd>
            </div>
          ) : null}
          {pipeline.blockedBy ? (
            <div className="term-bot-analysis-pipeline-span">
              <dt>Blocked</dt>
              <dd className="term-pnl-neg">
                {pipeline.blockedBy}
                {pipeline.blockedReason ? ` — ${pipeline.blockedReason}` : ''}
              </dd>
            </div>
          ) : null}
          {opening ? (
            <div className="term-bot-analysis-pipeline-span">
              <dt>Open</dt>
              <dd className="term-pnl-pos">
                {pipeline.fillConfirmed ? 'Fill confirmed on HL' : 'Order in flight — opening when HL confirms'}
              </dd>
            </div>
          ) : null}
          {pipeline.gates.length > 0 ? (
            <div className="term-bot-analysis-pipeline-span">
              <dt>Gates passed</dt>
              <dd>{pipeline.gates.join(' · ')}</dd>
            </div>
          ) : null}
        </dl>
        {pipeline.focusReason ? (
          <p className="term-bot-analysis-focus-reason">{pipeline.focusReason}</p>
        ) : null}
        {pipeline.execReason ? (
          <p className="term-bot-analysis-exec-reason">{pipeline.execReason}</p>
        ) : null}
        {pipeline.diagLine ? <p className="term-hint">{pipeline.diagLine}</p> : null}
      </div>

      <div className="term-bot-analysis-live">
        <h3 className="term-bot-analysis-section-title">Live detail</h3>
        {lines.length > 0 ? (
          <ul className="term-bot-analysis-lines">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="term-hint">
            Accept / reject reasons and blockers appear here each scan cycle.
          </p>
        )}
      </div>

      <ProTradeScanCyclePanel
        universe={scanUniverseCoins?.length > 0 ? scanUniverseCoins : []}
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
          Managing {openPositionsCount} open trade{openPositionsCount === 1 ? '' : 's'} — engine log continues for free slots.
        </p>
      ) : null}
    </div>
  );
};

function headlineIsOpening(headline: string | null | undefined): boolean {
  if (!headline) return false;
  return /opening trade|waiting confirmation|order/i.test(headline);
}

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
      {scanning ? <Activity size={14} className="term-analysis-pulse" aria-hidden /> : null}
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