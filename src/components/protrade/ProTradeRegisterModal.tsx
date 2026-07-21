import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useTermAuthToast } from '../terminal/TermAuthToast';
import RegisterForm from '../auth/RegisterForm';
import registerVisual from '../../assets/landing/hypergain-trading-candles.jpeg';

type Props = {
  open: boolean;
  onClose: () => void;
  onSwitchToSignIn?: () => void;
  /** Render dialog only — parent supplies backdrop */
  embedded?: boolean;
};

const ProTradeRegisterModal: React.FC<Props> = ({
  open,
  onClose,
  onSwitchToSignIn,
  embedded = false,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const closedForUserRef = useRef(false);
  const { showToast } = useTermAuthToast();

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
      className="hl-modal hl-auth-modal hl-auth-modal--register"
      role="dialog"
      aria-labelledby="hl-register-title"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="hl-auth-modal-close"
        onClick={onClose}
        aria-label={t('auth.signInModal.close')}
      >
        <X size={16} />
      </button>

      <div className="hl-auth-modal-split">
        <div className="hl-auth-modal-form">
          <h2 id="hl-register-title" className="hl-auth-modal-title">
            {t('auth.register.modalTitle')}
          </h2>
          <p className="hl-auth-modal-sub">{t('auth.register.modalSub')}</p>
          <RegisterForm
            idPrefix="modal-reg"
            onSwitchToSignIn={onSwitchToSignIn}
            onToast={showToast}
            onSessionCreated={() => {
              showToast(t('auth.register.accountCreatedWelcome'), 3000);
              onClose();
            }}
          />
        </div>

        <aside className="hl-auth-modal-visual" aria-hidden>
          <img
            src={registerVisual}
            alt=""
            className="hl-auth-modal-visual-img"
          />
          <div className="hl-auth-modal-visual-overlay">
            <p className="hl-auth-visual-kicker">{t('auth.register.visualKicker')}</p>
            <h3 className="hl-auth-visual-title">{t('auth.register.visualTitle')}</h3>
            <p className="hl-auth-visual-copy">{t('auth.register.visualCopy')}</p>
          </div>
        </aside>
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

export default ProTradeRegisterModal;
