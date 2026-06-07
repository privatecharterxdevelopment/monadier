import React from 'react';
import { ProTradeThemeProvider, useProTradeTheme } from '../../contexts/ProTradeThemeContext';
import '../../styles/pro-trade-hl.css';

type Props = {
  children: React.ReactNode;
};

const ProTradeShellInner: React.FC<Props> = ({ children }) => {
  const { theme } = useProTradeTheme();

  return <div className={`hl-root hl-root--${theme}`}>{children}</div>;
};

/** Full-viewport Pro Trade shell — light (dashboard2) or dark theme. */
const ProTradeShell: React.FC<Props> = ({ children }) => {
  return (
    <ProTradeThemeProvider>
      <ProTradeShellInner>{children}</ProTradeShellInner>
    </ProTradeThemeProvider>
  );
};

export default ProTradeShell;
