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
      subtitle="Bot mode, leverage, and risk are locked while the bot is running"
      icon={<AlertTriangle size={20} />}
      onClose={onClose}
      closeDisabled={stopBusy}
      footer={
        <div className="term-modal-actions">
          <button
            type="button"
            className="term-modal-secondary"
            onClick={onClose}
            disabled={stopBusy}
          >
            Keep running
          </button>
          <button
            type="button"
            className="term-modal-primary"
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
        <strong>1.</strong> Stop the bot · <strong>2.</strong> Change mode or settings ·{' '}
        <strong>3.</strong> Press <strong>Start bot</strong> again.
      </p>
      <p className="term-modal-hint" style={{ marginTop: 12 }}>
        Applies to <strong>Standard / Aggressive</strong> mode, leverage, and risk — not while the
        bot is active.
      </p>
      <p className="term-modal-hint term-modal-hint--ok" style={{ marginTop: 12 }}>
        Exits are automatic: the bot trails stop loss into profit (no manual TP/SL needed).
      </p>
    </TerminalModalFrame>
  );
};

export default BotSettingsStopFirstModal;
