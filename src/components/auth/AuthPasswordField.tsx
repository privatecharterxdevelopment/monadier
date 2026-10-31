import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
  className?: string;
};

/** Password input with show/hide toggle for auth forms. */
const AuthPasswordField: React.FC<Props> = ({
  id,
  value,
  onChange,
  autoComplete = 'current-password',
  placeholder = '••••••••',
  minLength,
  required = false,
  className = '',
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-password-field">
      <input
        id={id}
        className={`term-profile-input ${className}`.trim()}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        minLength={minLength}
        required={required}
      />
      <button
        type="button"
        className="auth-password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </div>
  );
};

export default AuthPasswordField;
