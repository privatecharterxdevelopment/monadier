import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { enableDemoMode, isDemoModeAllowed } from '../lib/demoMode';
import '../styles/dashboard2-nixole.css';

type Dashboard2LayoutProps = {
  children: React.ReactNode;
};

/** Full-page shell — no legacy dashboard sidebar / topbar */
const Dashboard2Layout: React.FC<Dashboard2LayoutProps> = ({ children }) => {
  const { isAuthenticated, sessionReady } = useAuth();
  const showDevBar =
    import.meta.env.DEV && sessionReady && !isAuthenticated && isDemoModeAllowed();

  return (
    <div className="nix-app h-full w-full min-h-0">
      {showDevBar && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-[#0a0a0a] text-center text-xs py-1.5 px-4 flex flex-wrap items-center justify-center gap-3">
          <span>Dev mode — no login required.</span>
          <button type="button" className="underline font-semibold" onClick={() => { enableDemoMode(); window.location.reload(); }}>
            Demo
          </button>
          <Link to="/login" className="underline font-semibold">Sign in</Link>
        </div>
      )}
      <div className={showDevBar ? 'nix-app-inner nix-app-inner--dev' : 'nix-app-inner'}>
        {children}
      </div>
    </div>
  );
};

export default Dashboard2Layout;
