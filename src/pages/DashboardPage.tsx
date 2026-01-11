import React from 'react';
import { Route, Routes } from 'react-router-dom';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import SideNavigation from '../components/dashboard/SideNavigation';
import DashboardOverview from './dashboard/DashboardOverview';
import TradingBotPage from './dashboard/TradingBotPage';
import BotHistoryPage from './dashboard/BotHistoryPage';
import DownloadsPage from './dashboard/DownloadsPage';
import SubscriptionsPage from './dashboard/SubscriptionsPage';
import SettingsPage from './dashboard/SettingsPage';
import AdminMonitorPage from './dashboard/AdminMonitorPage';

const DashboardPage: React.FC = () => {
  return (
    <div className="bg-background min-h-screen">
      <SideNavigation />

      <div className="ml-20">
        <div className="container-custom py-4">
          <DashboardHeader />

          <main className="py-8">
            <Routes>
              <Route path="/" element={<DashboardOverview />} />
              <Route path="/chart-trading" element={<TradingBotPage />} />
              <Route path="/trading-bot" element={<BotHistoryPage />} />
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
