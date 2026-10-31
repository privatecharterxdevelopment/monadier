import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProTradeThemeOptional } from '../../../contexts/ProTradeThemeContext';

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

/** Fixed bottom bet slip — visible without scrolling (mobile betting). */
const SportsbetsMobileOrderSheet: React.FC<Props> = ({
  open,
  title,
  onClose,
  children,
}) => {
  const { t } = useTranslation();
  const theme = useProTradeThemeOptional();
  const sheetTitle = title ?? t('betting.placeBet');

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className={`hl-root hl-root--${theme} hl-sb-order-sheet-portal`}>
      <button
        type="button"
        className="hl-sb-order-sheet-backdrop"
        aria-label={t('betting.closeBetPanel')}
        onClick={onClose}
      />
      <div className="hl-sb-order-sheet" role="dialog" aria-modal="true" aria-label={sheetTitle}>
        <header className="hl-sb-order-sheet-head">
          <span className="hl-sb-order-sheet-title">{sheetTitle}</span>
          <button type="button" className="hl-modal-close hl-sb-order-sheet-close" onClick={onClose}>
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="hl-sb-order-sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default SportsbetsMobileOrderSheet;
