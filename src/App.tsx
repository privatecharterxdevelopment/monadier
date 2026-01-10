import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useDesktopLicense, isDesktopApp } from './hooks/useDesktopLicense';
import Logo from './components/ui/Logo';
import ScrollToTop from './components/animations/ScrollToTop';
import PageTransition from './components/animations/PageTransition';
import LicenseActivation from './components/desktop/LicenseActivation';

// Pages
import LandingPage from './pages/LandingPage';
import HowItWorksPage from './pages/HowItWorksPage';
import CardPage from './pages/CardPage';
import BotTradingPage from './pages/BotTradingPage';
import AboutPage from './pages/AboutPage';
import SupportPage from './pages/SupportPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import KycFlowPage from './pages/KycFlowPage';
import DashboardPage from './pages/DashboardPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import SupportWidget from './components/ui/SupportWidget';

function App() {
  const { isLoading } = useAuth();
  const location = useLocation();
  const { isDesktop, isLicensed, isLoading: licenseLoading } = useDesktopLicense();
  const [licenseActivated, setLicenseActivated] = useState(false);

  // Show loading while checking auth and license
  if (isLoading || (isDesktop && licenseLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse">
          <Logo />
        </div>
      </div>
    );
  }

  // Desktop mode: show license activation if not licensed
  if (isDesktop && !isLicensed && !licenseActivated) {
    return <LicenseActivation onActivated={() => setLicenseActivated(true)} />;
  }

  // Show support widget on public pages only
  const showSupportWidget = !location.pathname.startsWith('/dashboard') &&
    !location.pathname.startsWith('/login') &&
    !location.pathname.startsWith('/register') &&
    !location.pathname.startsWith('/kyc');

  return (
    <>
      <ScrollToTop />
      {showSupportWidget && <SupportWidget />}
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={
            <PageTransition>
              <LandingPage />
            </PageTransition>
          } />
          <Route path="/how-it-works" element={
            <PageTransition>
              <HowItWorksPage />
            </PageTransition>
          } />
          <Route path="/card" element={
            <PageTransition>
              <CardPage />
            </PageTransition>
          } />
          <Route path="/trading-bot" element={
            <PageTransition>
              <BotTradingPage />
            </PageTransition>
          } />
          <Route path="/about" element={
            <PageTransition>
              <AboutPage />
            </PageTransition>
          } />
          <Route path="/support" element={
            <PageTransition>
              <SupportPage />
            </PageTransition>
          } />
          <Route path="/login" element={
            <PageTransition>
              <LoginPage />
            </PageTransition>
          } />
          <Route path="/register" element={
            <PageTransition>
              <RegisterPage />
            </PageTransition>
          } />
          
          <Route path="/kyc" element={
            <ProtectedRoute>
              <PageTransition>
                <KycFlowPage />
              </PageTransition>
            </ProtectedRoute>
          } />
          
          <Route path="/dashboard/*" element={
            <ProtectedRoute>
              <PageTransition>
                <DashboardPage />
              </PageTransition>
            </ProtectedRoute>
          } />
          
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

export default App;