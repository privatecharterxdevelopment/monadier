import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { Web3Provider } from './contexts/Web3Context';
import { NotificationProvider } from './contexts/NotificationContext';
import { config } from './lib/wallet';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getEnvSetupIssue } from './lib/envCheck';
import EnvSetupScreen from './components/EnvSetupScreen';
import AuthWalletReset from './components/auth/AuthWalletReset';
import AuthOAuthCapture from './components/auth/AuthOAuthCapture';
import WalletSessionBridge from './components/auth/WalletSessionBridge';
import './index.css';

const queryClient = new QueryClient();
const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('#root element not found');
}

const envIssue = getEnvSetupIssue();

createRoot(rootEl).render(
  <StrictMode>
    {envIssue ? (
      <EnvSetupScreen issue={envIssue} />
    ) : (
      <ErrorBoundary>
      <WagmiProvider config={config} reconnectOnMount>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <SubscriptionProvider>
                <NotificationProvider>
                  <Web3Provider>
                    <WalletSessionBridge />
                    <AuthOAuthCapture />
                    <AuthWalletReset />
                    <App />
                  </Web3Provider>
                </NotificationProvider>
              </SubscriptionProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </WagmiProvider>
      </ErrorBoundary>
    )}
  </StrictMode>
);
