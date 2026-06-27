import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { APP_LANGUAGES, type AppLanguage } from '../../i18n/languages';

export type LanguageSwitcherVariant = 'landing-light' | 'landing-dark' | 'app';

type Props = {
  variant?: LanguageSwitcherVariant;
  className?: string;
};

const LanguageSwitcher: React.FC<Props> = ({ variant = 'landing-light', className = '' }) => {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0] as AppLanguage;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const pick = (code: AppLanguage) => {
    void i18n.changeLanguage(code);
    close();
  };

  const menu = (
    <ul id={listId} className={variant === 'app' ? 'hl-lang-switch-menu' : 'lang-switch-menu'} role="listbox" aria-label={t('language.select')}>
      {APP_LANGUAGES.map(({ code, labelKey }) => {
        const selected = current === code;
        return (
          <li key={code} role="option" aria-selected={selected}>
            <button
              type="button"
              className={
                variant === 'app'
                  ? `hl-lang-switch-option${selected ? ' hl-lang-switch-option--active' : ''}`
                  : `lang-switch-option${selected ? ' lang-switch-option--active' : ''}`
              }
              onClick={() => pick(code)}
            >
              <span>{t(labelKey)}</span>
              {selected ? <Check size={14} aria-hidden className="lang-switch-check" /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (variant === 'app') {
    return (
      <div ref={rootRef} className={`hl-lang-switch${className ? ` ${className}` : ''}`}>
        <button
          type="button"
          className="hl-topnav-icon-btn hl-lang-switch-btn"
          aria-label={t('language.select')}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
        >
          <Globe size={16} strokeWidth={1.75} aria-hidden />
        </button>
        {open ? menu : null}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`lang-switch lang-switch--${variant}${className ? ` ${className}` : ''}`.trim()}
    >
      <button
        type="button"
        className="lang-switch-trigger"
        aria-label={t('language.select')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <Globe size={16} aria-hidden />
      </button>
      {open ? menu : null}
    </div>
  );
};

export default LanguageSwitcher;
