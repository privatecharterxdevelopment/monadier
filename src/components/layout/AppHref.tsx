import React from 'react';
import OpenAppLink from './OpenAppLink';

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement>;

/** @deprecated Use OpenAppLink — always opens Pro Trade without auth detours */
const AppHref: React.FC<Props> = ({ children, className, ...rest }) => (
  <OpenAppLink className={className} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
    {children}
  </OpenAppLink>
);

export default AppHref;
