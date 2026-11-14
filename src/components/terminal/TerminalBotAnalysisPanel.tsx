import React, { useMemo } from 'react';
import { useBotAnalysisCore, useBotAnalysisPulse } from '../../contexts/BotTerminalAnalysisContext';
import ProTradeScanCyclePanel from '../protrade/ProTradeScanCyclePanel';
import { formatJournalTime } from '../../lib/botAnalysisJournal';
import {
  executionHeadline,
  formatExecutionDiagnosticLine,
} from '../../lib/hlExecutionDisplay';
import AnalyticLiveHero from './AnalyticLiveHero';
import AnalyticAccordionSection from './AnalyticAccordionSection';
import { shortScanBlockReason } from '../../lib/hlScanCycleDisplay';
import { isBotScanNoiseDetail } from '../../lib/hlBotReasonLabels';

const TerminalBotAnalysisPanel: React.FC = () => {
  const core = useBotAnalysisCore();
  const pulse = useBotAnalysisPulse();
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
  } = core;

  const candidates = [...(boardCandidates ?? []), ...(globalCandidates ?? [])].map((c) => ({
    coin: c.coin,
    direction: c.direction,
    confidence: c.confidence,
  }));

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

  const statusTone = opening
    ? 'pos'
    : pipeline.blockedBy
      ? 'neg'
      : scanning
        ? 'warn'
        : 'muted';

  const statusLabel =
    pipeline.headline ??
    (opening
      ? 'Opening'
      : pipeline.blockedBy
        ? 'Blocked'
        : botRunning
          ? scanning
            ? 'Scanning'
            : 'Ready'
          : 'Idle');

  const narrativeChips = useMemo(
    () => tokenizeNarrative(liveNarrative),
    [liveNarrative]
  );

  const passCount = candidates.length;
  const blockCount = scanSkips?.length ?? 0;

  return (
    <div className="term-bot-analysis-panel term-bot-analysis-panel--modern">
      <AnalyticLiveHero
        botRunning={botRunning}
        scanning={scanning}
        progress={pulse.progress}
        coin={currentlyScanningCoin}
        statusLabel={statusLabel}
        statusTone={statusTone}
        focusCoin={pipeline.focusCoin}
        focusDir={pipeline.focusDir}
        focusConf={pipeline.focusConf}
        tfChips={pulse.engineTfChips ?? []}
      />

      <div className="term-analytic-badges" aria-label="Engine pipeline">
        {pipeline.scanPassed === true ? (
          <span className="term-analytic-badge term-analytic-badge--pass">Scan pass</span>
        ) : pipeline.scanPassed === false ? (
          <span className="term-analytic-badge term-analytic-badge--fail">Scan reject</span>
        ) : null}
        {pipeline.blockedBy ? (
          <span className="term-analytic-badge term-analytic-badge--fail" title={pipeline.blockedReason ?? ''}>
            {pipeline.blockedBy}
          </span>
        ) : null}
        {opening ? (
          <span className="term-analytic-badge term-analytic-badge--pass">
            {pipeline.fillConfirmed ? 'HL fill' : 'Order live'}
          </span>
        ) : null}
        {pipeline.gates.slice(0, 6).map((g) => (
          <span key={g} className="term-analytic-badge term-analytic-badge--gate">
            {g}
          </span>
        ))}
      </div>

      <AnalyticAccordionSection
        title="Engine detail"
        meta={pipeline.focusCoin ?? 'gates & reasons'}
        defaultOpen={Boolean(pipeline.focusReason || pipeline.execReason)}
      >
        {pipeline.focusReason && !isBotScanNoiseDetail(pipeline.focusReason) ? (
          <p className="term-analytic-chip-line">{pipeline.focusReason}</p>
        ) : pipeline.focusReason ? (
          <span className="term-analytic-badge term-analytic-badge--muted">Pre-open gate active</span>
        ) : null}
        {pipeline.execReason ? (
          <p className="term-analytic-chip-line term-analytic-chip-line--dim">{pipeline.execReason}</p>
        ) : null}
        {pipeline.diagLine ? <p className="term-analytic-chip-line term-analytic-chip-line--dim">{pipeline.diagLine}</p> : null}
        {!pipeline.focusReason && !pipeline.execReason && !pipeline.diagLine ? (
          <p className="term-hint">Gates and blockers show here when the engine evaluates a fill.</p>
        ) : null}
      </AnalyticAccordionSection>

      <AnalyticAccordionSection
        title="Live feed"
        meta={`${narrativeChips.length} signal${narrativeChips.length === 1 ? '' : 's'}`}
        defaultOpen={narrativeChips.length > 0 && narrativeChips.length <= 8}
      >
        {narrativeChips.length > 0 ? (
          <ul className="term-analytic-chip-grid">
            {narrativeChips.map((chip) => (
              <li key={chip.key}>
                <span
                  className={`term-analytic-chip term-analytic-chip--${chip.tone}`}
                  title={chip.full}
                >
                  {chip.short}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="term-hint">Waiting for scan updates — tied to the same engine as the chart badges.</p>
        )}
      </AnalyticAccordionSection>

      <AnalyticAccordionSection
        title="Scan cycle"
        meta={
          coinsScannedMeta(globalCoinsScanned, passCount, blockCount, scanComplete)
        }
        badge={
          <span className="term-analytic-count">
            {passCount}/{Math.max(passCount + blockCount, 1)}
          </span>
        }
      >
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
      </AnalyticAccordionSection>

      <AnalyticAccordionSection
        title="Journal"
        meta="Last 10 min"
        defaultOpen={false}
      >
        {journalHistory.length === 0 ? (
          <p className="term-hint">No journal yet — start the agent to log scan verdicts.</p>
        ) : (
          <ul className="term-bot-analysis-journal term-bot-analysis-journal--compact">
            {[...journalHistory].reverse().slice(0, 12).map((entry) => (
              <li key={`${entry.at}-${entry.detail.slice(0, 40)}`} className="term-bot-analysis-journal-item">
                <div className="term-bot-analysis-journal-head">
                  <time dateTime={new Date(entry.at).toISOString()}>{formatJournalTime(entry.at)}</time>
                  <span className="term-analytic-badge term-analytic-badge--muted term-analytic-badge--xs">
                    {entry.verdict}
                  </span>
                  {entry.coin ? (
                    <span className="term-bot-analysis-journal-coin">{entry.coin.toUpperCase()}</span>
                  ) : null}
                </div>
                <details className="term-analytic-journal-drop">
                  <summary>Expand</summary>
                  <p className="term-bot-analysis-journal-body">{entry.detail}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </AnalyticAccordionSection>

      {openPositionsCount > 0 ? (
        <p className="term-hint term-bot-analysis-foot">
          {openPositionsCount} open — log continues for free slots.
        </p>
      ) : null}
    </div>
  );
};

function coinsScannedMeta(
  scanned: number,
  pass: number,
  block: number,
  complete: boolean
): string {
  const head = scanned > 0 ? `${scanned} perps` : 'HL universe';
  return `${head} · ${pass} pass · ${block} blocked${complete ? '' : ' · …'}`;
}

function headlineIsOpening(headline: string | null | undefined): boolean {
  if (!headline) return false;
  return /opening trade|waiting confirmation|order/i.test(headline);
}

type NarrativeChip = { key: string; short: string; full: string; tone: 'pos' | 'neg' | 'muted' | 'warn' };

function tokenizeNarrative(blob: string): NarrativeChip[] {
  const lines = blob.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: NarrativeChip[] = [];
  for (const line of lines) {
    if (/^Scan skips/i.test(line)) {
      const parts = line.replace(/^Scan skips —\s*/i, '').split(' · ');
      for (const p of parts) {
        const m = p.match(/^(\w+):\s*(.+)$/);
        const short = m ? `${m[1]} · ${shortScanBlockReason(m[2])}` : p;
        out.push({
          key: `skip-${p}`,
          short,
          full: p,
          tone: 'muted',
        });
      }
      continue;
    }
  if (isBotScanNoiseDetail(line)) {
      out.push({
        key: line.slice(0, 48),
        short: shorten(line, 42),
        full: line,
        tone: 'warn',
      });
      continue;
    }
    const tone: NarrativeChip['tone'] =
      /blocked|reject|fail|margin/i.test(line)
        ? 'neg'
        : /opening|pass|accepted|fill/i.test(line)
          ? 'pos'
          : 'muted';
    if (line.includes(' · ')) {
      for (const seg of line.split(' · ')) {
        out.push({
          key: `${line}-${seg}`,
          short: shorten(seg, 36),
          full: seg,
          tone,
        });
      }
    } else {
      out.push({
        key: line.slice(0, 56),
        short: shorten(line, 44),
        full: line,
        tone,
      });
    }
  }
  return out.slice(0, 40);
}

function shorten(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export default TerminalBotAnalysisPanel;