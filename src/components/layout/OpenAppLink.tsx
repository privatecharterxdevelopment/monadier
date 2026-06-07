import React from 'react';
import { useNavigate } from 'react-router-dom';
import { goToOpenApp, OPEN_APP_PATH } from '../../lib/appUrls';

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  className?: string;
  children: React.ReactNode;
};

/** Landing / marketing CTA — opens Pro Trade at /app (never legacy /dashboard2). */
const OpenAppLink: React.FC<Props> = ({ className, children, onClick, ...rest }) => {
  const navigate = useNavigate();

  return (
    <a
      href={OPEN_APP_PATH}
      className={className}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        const inApp = goToOpenApp('', false);
        if (inApp) navigate(inApp);
      }}
      {...rest}
    >
      {children}
    </a>
  );
};

export default OpenAppLink;
