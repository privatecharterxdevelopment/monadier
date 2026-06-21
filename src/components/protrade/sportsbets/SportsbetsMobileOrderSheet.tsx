import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

/** Fixed bottom bet slip — visible without scrolling (mobile betting). */
const SportsbetsMobileOrderSheet: React.FC<Props> = ({
  open,
  title = 'Place bet',
  onClose,
  children,
}) => {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <button
        type="button"
        className="hl-sb-order-sheet-backdrop"
        aria-label="Close bet panel"
        onClick={onClose}
      />
      <div className="hl-sb-order-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="hl-sb-order-sheet-head">
          <span className="hl-sb-order-sheet-title">{title}</span>
          <button type="button" className="hl-modal-close hl-sb-order-sheet-close" onClick={onClose}>
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="hl-sb-order-sheet-body">{children}</div>
      </div>
    </>,
    document.body
  );
};

export default SportsbetsMobileOrderSheet;
