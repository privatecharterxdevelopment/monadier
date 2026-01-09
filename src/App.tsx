import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Logo from './components/ui/Logo';
import ScrollToTop from './components/animations/ScrollToTop';
import PageTransition from './components/animations/PageTransition';

// Pages
import LandingPage from './pages/LandingPage';
import BankingPage from './pages/BankingPage';
import SavingPage from './pages/SavingPage';
import InvestingPage from './pages/InvestingPage';
import AboutPage from './pages/AboutPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import KycFlowPage from './pages/KycFlowPage';
import DashboardPage from './pages/DashboardPage';
import ProtectedRoute from './components/auth/ProtectedRoute';

function App() {
  const { isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse">
          <Logo />
        </div>
      </div>
    );
  }

  return (
    <>
      <ScrollToTop />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={
            <PageTransition>
              <LandingPage />
            </PageTransition>
          } />
          <Route path="/banking" element={
            <PageTransition>
              <BankingPage />
            </PageTransition>
          } />
          <Route path="/saving" element={
            <PageTransition>
              <SavingPage />
            </PageTransition>
          } />
          <Route path="/investing" element={
            <PageTransition>
              <InvestingPage />
            </PageTransition>
          } />
          <Route path="/about" element={
            <PageTransition>
              <AboutPage />
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