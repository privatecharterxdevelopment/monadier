import React from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Logo from '../components/ui/Logo';
import { useAuth } from '../contexts/AuthContext';
import MarketingSeo from '../components/seo/MarketingSeo';
import SignInForm from '../components/auth/SignInForm';
import { afterAuthGo, getOpenAppPath } from '../lib/appUrls';
import { queueAuthToast } from '../lib/authToast';

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const successMessage = (location.state as { message?: string })?.message;
  const fromQuery = searchParams.get('from');
  const redirectTo =
    (fromQuery && fromQuery.startsWith('/') ? fromQuery : null) ??
    ((location.state as { from?: string })?.from?.startsWith('/')
      ? (location.state as { from: string }).from
      : null) ??
    getOpenAppPath();

  React.useEffect(() => {
    if (!isAuthenticated) return;
    queueAuthToast('signed_in');
    afterAuthGo(redirectTo, navigate);
  }, [isAuthenticated, navigate, redirectTo]);

  return (
    <div className="auth-page">
      <MarketingSeo path="/login" />
      <div className="container-custom py-6">
        <Logo size="md" theme="light" />
      </div>

      <div className="flex-grow flex items-center justify-center px-4 py-12">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="auth-card">
            <h1 className="font-display text-3xl mb-6 text-center text-[#0a0a0a]">
              {t('auth.welcomeBack')}
            </h1>
            <SignInForm
              idPrefix="page-signin"
              registerHref="/register"
              successMessage={successMessage}
              showDemo
              onDemo={() => navigate(redirectTo, { replace: true })}
              onSignedIn={() => {
                afterAuthGo(redirectTo, navigate);
              }}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
