import React from 'react';
import { goToOpenApp, OPEN_APP_PATH } from '../../lib/appUrls';

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  className?: string;
  children: React.ReactNode;
};

/** Landing / marketing CTA — always opens Pro Trade at `/` (never dashboard1/2). */
const OpenAppLink: React.FC<Props> = ({ className, children, onClick, ...rest }) => {
  return (
    <a
      href="/"
      className={className}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        goToOpenApp('', false);
      }}
      {...rest}
    >
      {children}
    </a>
  );
};

export default OpenAppLink;
