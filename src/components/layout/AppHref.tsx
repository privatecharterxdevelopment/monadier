import React from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { getAppEntryPath, getAppUrl, isExternalAppUrl } from '../../lib/appUrls';

type Props = Omit<LinkProps, 'to'> & {
  to?: string;
  href?: string;
};

/** Link to dashboard app — uses app subdomain when VITE_APP_URL is set */
const AppHref: React.FC<Props> = ({ to = getAppEntryPath(), href, children, className, ...rest }) => {
  const target = href ?? getAppUrl(to);
  if (isExternalAppUrl(target)) {
    return (
      <a href={target} className={className} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }
  return (
    <Link to={target} className={className} {...rest}>
      {children}
    </Link>
  );
};

export default AppHref;
