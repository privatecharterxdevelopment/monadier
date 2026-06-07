import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getAppEntryPath, getAppUrl, goToApp, isExternalAppUrl } from '../../lib/appUrls';

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  className?: string;
  children: React.ReactNode;
};

/** Landing / marketing CTA — always opens Pro Trade, never login/register. */
const OpenAppLink: React.FC<Props> = ({ className, children, onClick, ...rest }) => {
  const navigate = useNavigate();
  const href = getAppUrl();

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        const inApp = goToApp(getAppEntryPath(), false);
        if (inApp) navigate(inApp);
      }}
      {...rest}
    >
      {children}
    </a>
  );
};

export function useOpenAppHref(): string {
  return getAppUrl();
}

export function isOpenAppExternal(): boolean {
  return isExternalAppUrl(getAppUrl());
}

export default OpenAppLink;
