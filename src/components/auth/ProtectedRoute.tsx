import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [showBypass, setShowBypass] = useState(false);
  const [bypassed, setBypassed] = useState(() => {
    return localStorage.getItem('demoMode') === 'true';
  });

  // Show bypass option after 3 seconds of loading
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setShowBypass(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  const handleBypass = () => {
    localStorage.setItem('demoMode', 'true');
    setBypassed(true);
  };

  // If demo mode is enabled, allow access
  if (bypassed) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse-subtle mb-4">
          <span className="font-display text-accent text-3xl">Monadier</span>
        </div>
        <p className="text-secondary text-sm mb-4">Loading...</p>

        {showBypass && (
          <div className="text-center">
            <p className="text-secondary text-xs mb-2">Taking too long?</p>
            <button
              onClick={handleBypass}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 text-accent text-sm rounded-lg transition-colors"
            >
              Continue in Demo Mode
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
