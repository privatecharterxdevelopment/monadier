import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useDesktopLicense, isDesktopApp } from './hooks/useDesktopLicense';
import { TransactionProvider } from './contexts/TransactionContext';
import Logo from './components/ui/Logo';
import ScrollToTop from './components/animations/ScrollToTop';
import PageTransition from './components/animations/PageTransition';
import LicenseActivation from './components/desktop/LicenseActivation';
import TransactionToast from './components/ui/TransactionToast';

// Pages
import LandingPage from './pages/LandingPage';
import HowItWorksPage from './pages/HowItWorksPage';
import CardPage from './pages/CardPage';
import BotTradingPage from './pages/BotTradingPage';
import ForexPage from './pages/ForexPage';
import AboutPage from './pages/AboutPage';
import TechnologyPage from './pages/TechnologyPage';
import SupportPage from './pages/SupportPage';
import PricingPage from './pages/PricingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import FundsExplainedPage from './pages/FundsExplainedPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import RoadmapPage from './pages/RoadmapPage';
import KycFlowPage from './pages/KycFlowPage';
import DashboardPage from './pages/DashboardPage';
import Dashboard2Page from './pages/dashboard/Dashboard2Page';
import Dashboard2ProfilePage from './pages/dashboard/Dashboard2ProfilePage';
import Dashboard2ProPage from './pages/dashboard/Dashboard2ProPage';
import Dashboard2Layout from './layouts/Dashboard2Layout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import SupportWidget from './components/ui/SupportWidget';
import HostRedirects from './components/layout/HostRedirects';

function App() {
  const { isLoading } = useAuth();
  const location = useLocation();
  const { isDesktop, isLicensed, isLoading: licenseLoading } = useDesktopLicense();
  const [licenseActivated, setLicenseActivated] = useState(false);

  // Show loading while checking auth and license
  if (isLoading || (isDesktop && licenseLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen auth-page">
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
  const showSupportWidget =
    location.pathname !== '/' &&
    !location.pathname.startsWith('/dashboard') &&
    !location.pathname.startsWith('/dashboard2') &&
    !location.pathname.startsWith('/login') &&
    !location.pathname.startsWith('/register') &&
    !location.pathname.startsWith('/kyc');

  return (
    <TransactionProvider>
      <ScrollToTop />
      <HostRedirects />
      {showSupportWidget && <SupportWidget />}
      <TransactionToast />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<LandingPage />} />
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
          <Route path="/forex" element={
            <PageTransition>
              <ForexPage />
            </PageTransition>
          } />
          <Route path="/about" element={
            <PageTransition>
              <AboutPage />
            </PageTransition>
          } />
          <Route path="/technology" element={
            <PageTransition>
              <TechnologyPage />
            </PageTransition>
          } />
          <Route path="/support" element={
            <PageTransition>
              <SupportPage />
            </PageTransition>
          } />
          <Route path="/pricing" element={
            <PageTransition>
              <PricingPage />
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
          <Route path="/auth/callback" element={
            <PageTransition>
              <AuthCallbackPage />
            </PageTransition>
          } />
          <Route path="/your-funds" element={
            <PageTransition>
              <FundsExplainedPage />
            </PageTransition>
          } />
          <Route path="/terms" element={
            <PageTransition>
              <TermsPage />
            </PageTransition>
          } />
          <Route path="/privacy" element={
            <PageTransition>
              <PrivacyPage />
            </PageTransition>
          } />
          <Route path="/roadmap" element={
            <PageTransition>
              <RoadmapPage />
            </PageTransition>
          } />
          <Route path="/forgot-password" element={
            <PageTransition>
              <ForgotPasswordPage />
            </PageTransition>
          } />
          <Route path="/reset-password" element={
            <PageTransition>
              <ResetPasswordPage />
            </PageTransition>
          } />

          <Route path="/kyc" element={
            <ProtectedRoute>
              <PageTransition>
                <KycFlowPage />
              </PageTransition>
            </ProtectedRoute>
          } />
          
          <Route path="/dashboard" element={<Navigate to="/dashboard2" replace />} />
          <Route path="/dashboard/profile" element={<Navigate to="/dashboard2/profile" replace />} />

          <Route path="/dashboard/*" element={
            <ProtectedRoute>
              <PageTransition>
                <DashboardPage />
              </PageTransition>
            </ProtectedRoute>
          } />

          <Route
            path="/dashboard2"
            element={
              import.meta.env.DEV ? (
                <PageTransition fillViewport>
                  <Dashboard2Layout />
                </PageTransition>
              ) : (
                <ProtectedRoute>
                  <PageTransition fillViewport>
                    <Dashboard2Layout />
                  </PageTransition>
                </ProtectedRoute>
              )
            }
          >
            <Route index element={<Dashboard2Page />} />
            <Route path="profile" element={<Dashboard2ProfilePage />} />
            <Route path="pro" element={<Dashboard2ProPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AnimatePresence>
    </TransactionProvider>
  );
}

export default App;