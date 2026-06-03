import React from 'react';

type DashboardGlassPageProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

/** Secondary dashboard pages — dark header + white glass card (Coinglass family) */
const DashboardGlassPage: React.FC<DashboardGlassPageProps> = ({ title, subtitle, children }) => {
  return (
    <div className="dashboard-glass-page -mx-1 md:mx-0">
      <header className="terminal-metrics-bar rounded-2xl mb-0">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-display text-lg font-semibold tracking-tight text-white/95">
              {title}
            </span>
            {subtitle && <p className="text-sm text-white/50 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </header>
      <div className="terminal-main-card rounded-t-none">{children}</div>
    </div>
  );
};

export default DashboardGlassPage;
