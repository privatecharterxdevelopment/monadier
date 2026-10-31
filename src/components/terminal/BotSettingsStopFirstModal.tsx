import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Square } from 'lucide-react';
import TerminalModalFrame from './TerminalModalFrame';

type Props = {
  open: boolean;
  onClose: () => void;
  onStopBot: () => void;
  stopBusy?: boolean;
};

const BotSettingsStopFirstModal: React.FC<Props> = ({ open, onClose, onStopBot, stopBusy }) => {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <TerminalModalFrame
      title={t('tradePanel.stopFirstTitle')}
      subtitle={t('tradePanel.stopFirstSubtitle')}
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
            {t('tradePanel.keepRunning')}
          </button>
          <button
            type="button"
            className="term-modal-primary"
            onClick={onStopBot}
            disabled={stopBusy}
          >
            <Square size={14} />
            {t('tradePanel.stopBot')}
          </button>
        </div>
      }
    >
      <p className="term-modal-hint">{t('tradePanel.stopFirstHint')}</p>
      <p className="term-modal-hint" style={{ marginTop: 12 }}>
        {t('tradePanel.stopFirstNote')}
      </p>
    </TerminalModalFrame>
  );
};

export default BotSettingsStopFirstModal;
