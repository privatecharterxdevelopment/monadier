import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getAppEntryPath } from '../lib/appUrls';
import DashboardSidebar from '../components/dashboard/DashboardSidebar';
import DashboardTopBar from '../components/dashboard/DashboardTopBar';
import DashboardGlassPage from '../components/dashboard/DashboardGlassPage';
import DashboardOverview from './dashboard/DashboardOverview';
import BotTradingHubPage from './dashboard/BotTradingHubPage';
import DownloadsPage from './dashboard/DownloadsPage';
import SubscriptionsPage from './dashboard/SubscriptionsPage';
import AdminMonitorPage from './dashboard/AdminMonitorPage';
/** Pages with built-in Coinglass terminal (own dark header) */
function usesTerminalShell(pathname: string) {
  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/bot-trading') ||
    pathname.startsWith('/dashboard/chart-trades')
  );
}

const DashboardPage: React.FC = () => {
  const { pathname } = useLocation();
  const showCompactTopBar = usesTerminalShell(pathname);

  return (
    <div className="dashboard-app min-h-[100dvh]">
      <DashboardSidebar />

      <div className="dashboard-main md:pl-[260px] pb-[4.5rem] md:pb-0">
        <div className={`dashboard-main-inner ${showCompactTopBar ? 'max-w-[1500px]' : ''}`}>
          <DashboardTopBar compact={showCompactTopBar} />

          <main className="dashboard-content">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard2" replace />} />
              <Route path="/overview" element={<DashboardOverview />} />
              <Route path="/chart-trades" element={<BotTradingHubPage defaultTab="chart" />} />
              <Route path="/bot-trading" element={<BotTradingHubPage defaultTab="open" />} />
              <Route
                path="/monitor"
                element={
                  <DashboardGlassPage title="Admin" subtitle="Platform monitoring">
                    <AdminMonitorPage />
                  </DashboardGlassPage>
                }
              />
              <Route
                path="/downloads"
                element={
                  <DashboardGlassPage title="Downloads" subtitle="Desktop app & resources">
                    <DownloadsPage />
                  </DashboardGlassPage>
                }
              />
              <Route
                path="/subscriptions"
                element={
                  <DashboardGlassPage title="Plans" subtitle="Subscription & billing">
                    <SubscriptionsPage />
                  </DashboardGlassPage>
                }
              />
              <Route
                path="/profile"
                element={<Navigate to={`${getAppEntryPath()}?section=profile`} replace />}
              />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
