import React, { useEffect, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { HL_DYNAMIC_TRAIL } from '../../../lib/hlBotStrategy';
import { formatHlSlLabel } from '../../../lib/hlBotEffectiveSettings';
import '../../../styles/dashboard2-nixole.css';
import '../../../styles/pro-trade-hl.css';

const ROTATE_MS = 3000;
const SCAN_TOTAL = 200;

type MockScan = {
  coin: string;
  pos: number;
  progress: number;
  direction: 'LONG' | 'SHORT' | 'HOLD';
  confidence: number;
  tfSummary: string;
  whyLine: string;
  detail: string;
  gateLine?: string;
};

const trailRef = `Peak→+${HL_DYNAMIC_TRAIL.armMinRoePct}%`;
const slRef = formatHlSlLabel(0).replace(/^Max /, '');

const MOCK_SCANS: MockScan[] = [
  {
    coin: 'BTC',
    pos: 1,
    progress: 8,
    direction: 'LONG',
    confidence: 78,
    tfSummary: '5m LONG 81% · 15m LONG 76% · 1h LONG 72%',
    whyLine: 'Checking BTC: 5m LONG 81% · 15m LONG 76% · 1h LONG 72%',
    detail: '3 TFs aligned · trend 1h UP · location OK · macro BTC+ETH not opposing',
  },
  {
    coin: 'ETH',
    pos: 2,
    progress: 12,
    direction: 'LONG',
    confidence: 74,
    tfSummary: '5m LONG 70% · 15m LONG 74% · 1h LONG 68%',
    whyLine: 'ETH LONG 74% — 3 TFs aligned · trend 1h UP · trail armed',
    detail: `Risk 100% · LVRG 20x · SL ${slRef} · Trail ${trailRef}`,
  },
  {
    coin: 'SOL',
    pos: 3,
    progress: 16,
    direction: 'LONG',
    confidence: 71,
    tfSummary: '5m LONG 69% · 15m LONG 71% · 1h LONG 71%',
    whyLine: 'SOL MTF: 5m LONG 69% · 15m LONG 71% · 1h LONG 71%',
    detail: 'Scanning 200+ HL pairs — strongest alt setup this rotation',
  },
  {
    coin: 'HYPE',
    pos: 4,
    progress: 21,
    direction: 'SHORT',
    confidence: 66,
    tfSummary: '5m SHORT 62% · 15m SHORT 66% · 1h FLAT',
    whyLine: 'Checking HYPE: 5m SHORT 62% · 15m SHORT 66% · 1h not rolling over yet',
    detail: 'Pump-short gate — need 15m fade before alt SHORT entry',
    gateLine: 'Gate 4/14 — higher TF still heating',
  },
  {
    coin: 'LINK',
    pos: 5,
    progress: 24,
    direction: 'HOLD',
    confidence: 41,
    tfSummary: '5m SHORT 52% · 15m LONG 61% · 1h LONG 58%',
    whyLine: 'LINK: 5m SHORT 52% · 15m LONG 61% · 1h LONG 58% — timeframes disagree',
    detail: 'Bot scans liquid HL perps for an aligned setup elsewhere — no entry here',
    gateLine: 'Gate 8/14 — waiting for cleaner multi-TF agreement',
  },
  {
    coin: 'ARB',
    pos: 6,
    progress: 29,
    direction: 'LONG',
    confidence: 76,
    tfSummary: '5m LONG 76% · 15m LONG 73% · 1h LONG 70%',
    whyLine: 'ARB LONG 76% — 3 TFs · 1h UP · location OK',
    detail: 'Fresh-pump check passed · 4h/24h bias neutral · candidate queued',
  },
  {
    coin: 'WLD',
    pos: 7,
    progress: 33,
    direction: 'LONG',
    confidence: 69,
    tfSummary: '5m LONG 65% · 15m LONG 69% · 1h LONG 64%',
    whyLine: 'Checking WLD: 5m LONG 65% · 15m LONG 69% · 1h LONG 64%',
    detail: 'ETH-beta alt · macro momentum OK · scanning next pair',
  },
  {
    coin: 'DOGE',
    pos: 8,
    progress: 38,
    direction: 'SHORT',
    confidence: 63,
    tfSummary: '5m SHORT 63% · 15m SHORT 58% · 1h LONG 55%',
    whyLine: 'Macro momentum BLOCK SHORT DOGE — BTC 15m +0.42% · ETH 15m +0.28%',
    detail: 'Counter-beta SHORT skipped — bot continues full universe scan',
    gateLine: 'Gate 2/14 — macro beta (BTC+ETH pump)',
  },
  {
    coin: 'AVAX',
    pos: 9,
    progress: 42,
    direction: 'LONG',
    confidence: 72,
    tfSummary: '5m LONG 68% · 15m LONG 72% · 1h LONG 69%',
    whyLine: 'AVAX LONG 72% — higher TFs aligned · 4h bias neutral',
    detail: '14 pre-open gates · 3/3 TFs · trend filter PASS',
  },
  {
    coin: 'LINK',
    pos: 10,
    progress: 47,
    direction: 'LONG',
    confidence: 81,
    tfSummary: '5m LONG 84% · 15m LONG 79% · 1h LONG 77%',
    whyLine: 'Slot 1: LINK LONG 81% — 3 TFs · 1h UP · strongest setup this cycle',
    detail: 'Location OK · pump gate clear · awaiting open slot',
  },
  {
    coin: 'SUI',
    pos: 11,
    progress: 52,
    direction: 'HOLD',
    confidence: 38,
    tfSummary: '5m LONG 51% · 15m FLAT 48% · 1h LONG 55%',
    whyLine: 'Checking SUI: 5m LONG 51% · 15m FLAT 48% · 1h LONG 55% — no entry yet',
    detail: 'Need 15m or 1h SHORT/LONG confirmation before entry',
  },
  {
    coin: 'OP',
    pos: 12,
    progress: 56,
    direction: 'LONG',
    confidence: 70,
    tfSummary: '5m LONG 68% · 15m LONG 70% · 1h LONG 67%',
    whyLine: 'OP MTF: 5m LONG 68% · 15m LONG 70% · 1h LONG 67%',
    detail: `Scanned ${12}/${SCAN_TOTAL} HL perps this cycle — 4 tradeable setup(s)`,
  },
];

/** Dock-style bot analyzer — rotates 12 mock scans like the live /app terminal. */
const LandingBotAnalysisCarousel: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const scan = MOCK_SCANS[index] ?? MOCK_SCANS[0];
  const signalClass =
    scan.direction === 'LONG' ? 'term-pnl-pos' : scan.direction === 'SHORT' ? 'term-pnl-neg' : '';

  useEffect(() => {
    const id = window.setInterval(() => {
      setFade(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % MOCK_SCANS.length);
        setFade(true);
      }, 160);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="landing-agent-visual-inner landing-agent-visual-inner--compact landing-bot-analysis-preview hl-root hl-root--light">
      <div className="hl-dock-empty hl-dock-empty--bot-scan landing-bot-analysis-dock" role="status">
        <div className="landing-bot-analysis-head">
          <Loader2 size={12} className="hl-dock-bot-scan-loader animate-spin" aria-hidden />
          <span className="hl-dock-bot-scan-title">Bot is reading market…</span>
          <span className="landing-bot-analysis-scan-head">
            · Scanning 200+ HL pairs · {scan.pos}/{SCAN_TOTAL}
          </span>
        </div>

        <div
          key={scan.coin + scan.pos}
          className={`landing-bot-analysis-body${fade ? ' landing-bot-analysis-body--in' : ' landing-bot-analysis-body--out'}`}
        >
          <div className="landing-bot-analyzer-tabs" role="tablist" aria-label="Bot scan fields">
            <div className="landing-bot-analyzer-tab" role="tab" aria-selected="true">
              <span className="landing-bot-analyzer-tab-label">Scan</span>
              <span className="landing-bot-analyzer-tab-value landing-bot-analyzer-tab-value--scan">
                <Activity size={10} className="term-analysis-pulse" aria-hidden />
                <span className="landing-bot-analyzer-tab-main">{scan.coin}</span>
                <span className="landing-bot-analyzer-tab-meta">{scan.pos}/{SCAN_TOTAL}</span>
                <span className="landing-bot-analyzer-tab-meta">{scan.progress}%</span>
              </span>
            </div>
            <div className="landing-bot-analyzer-tab" role="tab">
              <span className="landing-bot-analyzer-tab-label">Signal</span>
              <span className={`landing-bot-analyzer-tab-value landing-bot-analyzer-tab-value--single ${signalClass}`}>
                {scan.direction} {scan.confidence}%
              </span>
            </div>
            <div className="landing-bot-analyzer-tab" role="tab">
              <span className="landing-bot-analyzer-tab-label">Pair</span>
              <span className="landing-bot-analyzer-tab-value landing-bot-analyzer-tab-value--single">
                {scan.coin}
              </span>
            </div>
            <div className="landing-bot-analyzer-tab landing-bot-analyzer-tab--tf" role="tab">
              <span className="landing-bot-analyzer-tab-label">TF</span>
              <span
                className="landing-bot-analyzer-tab-value landing-bot-analyzer-tab-value--muted"
                title={scan.tfSummary}
              >
                {scan.tfSummary}
              </span>
            </div>
          </div>

          <p className="landing-bot-scan-line" aria-live="polite">
            {scan.whyLine}
            {scan.gateLine ? ` · ${scan.gateLine}` : ` · ${scan.detail}`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandingBotAnalysisCarousel;
