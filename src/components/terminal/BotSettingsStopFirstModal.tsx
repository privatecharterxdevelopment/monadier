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
      subtitle="Change leverage, risk, TP or SL only while the bot is off"
      icon={<AlertTriangle size={20} />}
      onClose={onClose}
      closeDisabled={stopBusy}
      footer={
        <div className="term-modal-actions">
          <button type="button" className="term-btn-sm" onClick={onClose} disabled={stopBusy}>
            Cancel
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
      <p className="term-hint">
        The bot reads your saved settings on the next open. Stop it now, adjust LVRG, then press{' '}
        <strong>Start bot</strong> again so leverage and risk apply cleanly.
      </p>
    </TerminalModalFrame>
  );
};

export default BotSettingsStopFirstModal;
