import React from 'react';
import { goToOpenApp, OPEN_APP_PATH } from '../../lib/appUrls';

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  className?: string;
  children: React.ReactNode;
};

/** Landing / marketing CTA — opens Pro Trade at `/` (never legacy /dashboard2). */
const OpenAppLink: React.FC<Props> = ({ className, children, onClick, ...rest }) => {
  return (
    <a
      href={OPEN_APP_PATH}
      className={className}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        goToOpenApp('');
      }}
      {...rest}
    >
      {children}
    </a>
  );
};

export default OpenAppLink;
