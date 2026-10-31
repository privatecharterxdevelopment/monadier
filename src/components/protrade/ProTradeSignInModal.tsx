import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useTermAuthToast } from '../terminal/TermAuthToast';
import SignInForm from '../auth/SignInForm';

type Props = {
  open: boolean;
  onClose: () => void;
  reason?: string;
  onSwitchToRegister?: () => void;
  /** Parent supplies backdrop — avoids double overlay when switching sign in ↔ register */
  embedded?: boolean;
};

const ProTradeSignInModal: React.FC<Props> = ({
  open,
  onClose,
  reason,
  onSwitchToRegister,
  embedded = false,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useTermAuthToast();
  const closedForUserRef = useRef(false);

  useEffect(() => {
    if (!open) {
      closedForUserRef.current = false;
      return;
    }
    if (!user || closedForUserRef.current) return;
    closedForUserRef.current = true;
    showToast(t('auth.signInModal.signedInSuccess'), 2800);
    onClose();
  }, [open, user, onClose, showToast, t]);

  if (!open) return null;

  const dialog = (
    <div
      className="hl-modal hl-modal--sm hl-signin-modal hl-signin-modal--modern"
      role="dialog"
      aria-labelledby="hl-signin-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="hl-signin-modern-head">
        <div className="hl-signin-modern-head-copy">
          <p className="hl-signin-modern-kicker">{t('auth.signInModal.kicker')}</p>
          <h2 id="hl-signin-title" className="hl-signin-modern-title">
            {t('auth.signInModal.title')}
          </h2>
        </div>
        <button
          type="button"
          className="hl-modal-close"
          onClick={onClose}
          aria-label={t('auth.signInModal.close')}
        >
          <X size={16} />
        </button>
      </div>

      <div className="hl-signin-modern-body">
        <SignInForm
          idPrefix="modal-signin"
          reason={reason}
          onSwitchToRegister={onSwitchToRegister}
          onSignedIn={() => {
            showToast(t('auth.signInModal.signedInSuccess'), 2800);
            onClose();
          }}
        />
      </div>
    </div>
  );

  if (embedded) return dialog;

  return (
    <div className="hl-modal-backdrop hl-modal-backdrop--auth" role="presentation" onClick={onClose}>
      {dialog}
    </div>
  );
};

export default ProTradeSignInModal;
