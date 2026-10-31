import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { enableDemoMode, isDemoModeAllowed, isDemoModeEnabled } from '../../lib/demoMode';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, sessionReady } = useAuth();
  const location = useLocation();
  const [showBypass, setShowBypass] = useState(false);
  const demoBypassAllowed = isDemoModeAllowed();

  useEffect(() => {
    if (isLoading || !sessionReady) {
      const timer = setTimeout(() => setShowBypass(true), 3000);
      return () => clearTimeout(timer);
    }
    setShowBypass(false);
  }, [isLoading, sessionReady]);

  const handleBypass = () => {
    enableDemoMode();
    window.location.reload();
  };

  // Dev demo mode — same tab, no re-login when already enabled
  if (demoBypassAllowed && isDemoModeEnabled()) {
    return <>{children}</>;
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Still restoring Supabase session from localStorage — do NOT send to /login yet
  if (!sessionReady || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen auth-page">
        <div className="animate-pulse-subtle mb-4">
          <span className="font-display text-accent text-3xl">HyperGain</span>
        </div>
        <p className="text-[#52525b] text-sm mb-4">Restoring your session…</p>

        {showBypass && demoBypassAllowed && (
          <div className="text-center">
            <p className="text-[#71717a] text-xs mb-2">Offline or slow network?</p>
            <button
              type="button"
              onClick={handleBypass}
              className="px-4 py-2 bg-[#0a0a0a] text-white text-sm rounded-full transition-colors hover:bg-[#27272a]"
            >
              Continue in demo mode (dev)
            </button>
          </div>
        )}
      </div>
    );
  }

  const redirectTo = `${location.pathname}${location.search}`;

  return <Navigate to="/login" replace state={{ from: redirectTo }} />;
};

export default ProtectedRoute;
