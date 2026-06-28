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
import MonadierAppRoot from './components/app/MonadierAppRoot';
import RedirectToApp from './components/app/RedirectToApp';
import SiteRootRoute from './components/app/SiteRootRoute';
import HowItWorksPage from './pages/HowItWorksPage';
import CardPage from './pages/CardPage';
import BotTradingPage from './pages/BotTradingPage';
import SportsBettingPage from './pages/SportsBettingPage';
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
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import KycFlowPage from './pages/KycFlowPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Dashboard2Layout from './layouts/Dashboard2Layout';
import AdminMonitorPage from './pages/dashboard/AdminMonitorPage';
import AdminMonitorLayout from './layouts/AdminMonitorLayout';
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

  return (
    <TransactionProvider>
      <ScrollToTop />
      <HostRedirects />
      <TransactionToast />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<SiteRootRoute />} />
          <Route path="/welcome" element={<Navigate to="/" replace />} />
          <Route path="/app" element={<MonadierAppRoot />} />
          <Route path="/app/*" element={<RedirectToApp />} />
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
          <Route path="/sports-betting" element={
            <PageTransition>
              <SportsBettingPage />
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
          <Route
            path="/your-funds"
            element={<Navigate to={{ pathname: '/how-it-works', hash: '#funds' }} replace />}
          />
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

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <PageTransition fillViewport>
                  <Dashboard2Layout>
                    <AdminMonitorLayout>
                      <AdminMonitorPage />
                    </AdminMonitorLayout>
                  </Dashboard2Layout>
                </PageTransition>
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard/monitor" element={<Navigate to="/admin" replace />} />
          <Route path="/dashboard/monitor/*" element={<Navigate to="/admin" replace />} />
          
          <Route path="/dashboard" element={<RedirectToApp />} />
          <Route path="/dashboard/*" element={<RedirectToApp />} />
          <Route path="/dashboard2" element={<RedirectToApp />} />
          <Route path="/dashboard2/*" element={<RedirectToApp />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AnimatePresence>
    </TransactionProvider>
  );
}

export default App;