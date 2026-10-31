import React from 'react';
import { Link } from 'react-router-dom';
import { REGISTRATION_CLOSED_MESSAGE } from '../../lib/productShutdown';
import '../../styles/auth-form.css';

export type RegisterFormProps = {
  onSessionCreated: () => void;
  onSwitchToSignIn?: () => void;
  signInHref?: string;
  idPrefix?: string;
  className?: string;
  initialEmail?: string;
  onToast?: (message: string, durationMs?: number) => void;
};

const RegisterForm: React.FC<RegisterFormProps> = ({
  onSwitchToSignIn,
  signInHref,
  className = '',
}) => {
  return (
    <div className={`hl-register ${className}`.trim()}>
      <p className="text-[#3f3f46] text-base leading-[1.6] max-w-[48ch]">
        {REGISTRATION_CLOSED_MESSAGE}
      </p>
      {signInHref ? (
        <Link to={signInHref} className="term-modal-primary mt-8 inline-flex">
          Sign in
        </Link>
      ) : (
        <button type="button" className="term-modal-primary mt-8" onClick={onSwitchToSignIn}>
          Sign in
        </button>
      )}
    </div>
  );
};

export default RegisterForm;
