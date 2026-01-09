import React from 'react';
import { Route, Routes } from 'react-router-dom';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import SideNavigation from '../components/dashboard/SideNavigation';
import DashboardOverview from './dashboard/DashboardOverview';
import CardPage from './dashboard/CardPage';
import TradingBotPage from './dashboard/TradingBotPage';
import BotHistoryPage from './dashboard/BotHistoryPage';
import SubscriptionsPage from './dashboard/SubscriptionsPage';
import SettingsPage from './dashboard/SettingsPage';

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
              <Route path="/card" element={<CardPage />} />
              <Route path="/trading-bot" element={<TradingBotPage />} />
              <Route path="/bot-history" element={<BotHistoryPage />} />
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
