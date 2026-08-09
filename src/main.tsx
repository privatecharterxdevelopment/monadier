import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { LandingThemeProvider } from './contexts/LandingThemeContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { Web3Provider } from './contexts/Web3Context';
import { NotificationProvider } from './contexts/NotificationContext';
import { applyLandingThemeToDocument, readStoredLandingTheme } from './lib/landingTheme';
import { config } from './lib/wallet';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getEnvSetupIssue } from './lib/envCheck';
import EnvSetupScreen from './components/EnvSetupScreen';
import AuthWalletReset from './components/auth/AuthWalletReset';
import AuthOAuthCapture from './components/auth/AuthOAuthCapture';
import ReferralCapture from './components/referral/ReferralCapture';
import WalletSessionBridge from './components/auth/WalletSessionBridge';
import MobileWalletConnectSheet from './components/wallet/MobileWalletConnectSheet';
import './i18n';
import './index.css';
import './styles/language-switcher.css';

const queryClient = new QueryClient();
const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('#root element not found');
}

applyLandingThemeToDocument(readStoredLandingTheme());

const envIssue = getEnvSetupIssue();

createRoot(rootEl).render(
  <StrictMode>
    {envIssue ? (
      <EnvSetupScreen issue={envIssue} />
    ) : (
      <ErrorBoundary>
      <WagmiProvider config={config} reconnectOnMount>
        <QueryClientProvider client={queryClient}>
          <HelmetProvider>
            <BrowserRouter>
              <LandingThemeProvider>
                <AuthProvider>
                  <SubscriptionProvider>
                    <NotificationProvider>
                      <Web3Provider>
                        <WalletSessionBridge />
                        <MobileWalletConnectSheet />
                        <AuthOAuthCapture />
                        <ReferralCapture />
                        <AuthWalletReset />
                        <App />
                      </Web3Provider>
                    </NotificationProvider>
                  </SubscriptionProvider>
                </AuthProvider>
              </LandingThemeProvider>
            </BrowserRouter>
          </HelmetProvider>
        </QueryClientProvider>
      </WagmiProvider>
      </ErrorBoundary>
    )}
  </StrictMode>
);
