import React from 'react';
import { Route, Routes } from 'react-router-dom';
import DashboardSidebar from '../components/dashboard/DashboardSidebar';
import DashboardTopBar from '../components/dashboard/DashboardTopBar';
import DashboardOverview from './dashboard/DashboardOverview';
import TradingBotPage from './dashboard/TradingBotPage';
import BotHistoryPage from './dashboard/BotHistoryPage';
import DownloadsPage from './dashboard/DownloadsPage';
import SubscriptionsPage from './dashboard/SubscriptionsPage';
import SettingsPage from './dashboard/SettingsPage';
import AdminMonitorPage from './dashboard/AdminMonitorPage';

const DashboardPage: React.FC = () => {
  return (
    <div className="dashboard-app min-h-[100dvh]">
      <DashboardSidebar />

      <div className="dashboard-main md:pl-[260px] pb-[4.5rem] md:pb-0">
        <div className="dashboard-main-inner">
          <DashboardTopBar />

          <main className="dashboard-content">
            <Routes>
              <Route path="/" element={<DashboardOverview />} />
              <Route path="/chart-trades" element={<TradingBotPage />} />
              <Route path="/bot-trading" element={<BotHistoryPage />} />
              <Route path="/monitor" element={<AdminMonitorPage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
              <Route path="/profile" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
