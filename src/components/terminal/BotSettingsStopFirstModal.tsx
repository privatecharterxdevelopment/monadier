import React from 'react';
import { AlertTriangle, Square } from 'lucide-react';
import TerminalModalFrame from './TerminalModalFrame';

type Props = {
  open: boolean;
  onClose: () => void;
  onStopBot: () => void;
  stopBusy?: boolean;
};

const BotSettingsStopFirstModal: React.FC<Props> = ({ open, onClose, onStopBot, stopBusy }) => {
  if (!open) return null;

  return (
    <TerminalModalFrame
      title="Stop bot first"
      subtitle="Risk, leverage, TP and SL are locked while the bot is running"
      icon={<AlertTriangle size={20} />}
      onClose={onClose}
      closeDisabled={stopBusy}
      footer={
        <div className="term-modal-actions">
          <button type="button" className="term-btn-sm" onClick={onClose} disabled={stopBusy}>
            Keep running
          </button>
          <button
            type="button"
            className="term-btn-sm term-btn-sm--primary"
            onClick={onStopBot}
            disabled={stopBusy}
          >
            <Square size={14} />
            Stop bot
          </button>
        </div>
      }
    >
      <p className="term-modal-hint">
        Stop the bot before changing leverage, risk, TP or SL. After you stop, adjust settings and
        press <strong>Start bot</strong> again.
      </p>
      <p className="term-modal-hint term-modal-hint--ok" style={{ marginTop: 12 }}>
        <strong>Standard / Aggressive</strong> mode can still be saved anytime — no restart needed.
      </p>
    </TerminalModalFrame>
  );
};

export default BotSettingsStopFirstModal;
