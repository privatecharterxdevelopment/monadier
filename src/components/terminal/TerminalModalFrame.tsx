import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

function getModalPortalRoot(): HTMLElement {
  // Body — not .nix-app / .hl-dock (overflow:hidden clips in-panel modals).
  if (typeof document !== 'undefined') {
    return document.body;
  }
  return document.getElementById('root') ?? document.body;
}

type Props = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
};

const TerminalModalFrame: React.FC<Props> = ({
  title,
  subtitle,
  icon,
  onClose,
  closeDisabled,
  children,
  footer,
  wide,
}) => {
  const portalRoot = useMemo(() => getModalPortalRoot(), []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeDisabled) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, closeDisabled]);

  return createPortal(
    <div
      className="term-modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !closeDisabled) onClose();
      }}
    >
      <div
        className={`term-modal ${wide ? 'term-modal--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="term-modal-head">
          <div className="term-modal-head-left">
            {icon && <div className="term-modal-icon">{icon}</div>}
            <div>
              <h2 className="term-modal-title">{title}</h2>
              {subtitle && <p className="term-modal-sub">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            className="term-modal-close"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>
        <div className="term-modal-body">{children}</div>
        {footer && <footer className="term-modal-foot">{footer}</footer>}
      </div>
    </div>,
    portalRoot
  );
};

export default TerminalModalFrame;
