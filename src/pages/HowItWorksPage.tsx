import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Shield,
  Wallet,
  Database,
  Gauge,
  Percent,
  Layers,
  AlertOctagon,
  Activity,
  ShieldAlert,
} from 'lucide-react';
import MarketingInnerPage from '../components/marketing/MarketingInnerPage';
import { HL_DEPOSIT_DO_NOT_USE } from '../lib/hlDepositRules';

type StepItem = { title: string; text: string };
type FundItem = { title: string; text: string };

const FUND_ICONS = [Wallet, Shield, Database, Wallet] as const;
const SETTINGS_ICONS = [Gauge, Percent, Layers, AlertOctagon, Activity] as const;

const ARBITRUM_LOGO = '/images/partners/arbitrum.svg';
const USDC_LOGO = '/images/partners/usdc.svg';

const HowItWorksPage: React.FC = () => {
  const { t } = useTranslation();
  const { hash } = useLocation();

  useEffect(() => {
    if (hash !== '#funds') return;
    const el = document.getElementById('funds');
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [hash]);

  const steps = useMemo(() => {
    const items = t('marketing.howItWorks.steps', { returnObjects: true });
    return Array.isArray(items) ? (items as StepItem[]) : [];
  }, [t]);

  const funds = useMemo(() => {
    const items = t('marketing.howItWorks.funds', { returnObjects: true });
    return Array.isArray(items) ? (items as FundItem[]) : [];
  }, [t]);

  const risks = useMemo(() => {
    const items = t('marketing.howItWorks.risks', { returnObjects: true });
    return Array.isArray(items) ? (items as string[]) : [];
  }, [t]);

  const custodyPoints = useMemo(() => {
    const items = t('marketing.howItWorks.custody.points', { returnObjects: true });
    return Array.isArray(items) ? (items as string[]) : [];
  }, [t]);

  const settings = useMemo(() => {
    const items = t('marketing.howItWorks.settings', { returnObjects: true });
    return Array.isArray(items) ? (items as FundItem[]) : [];
  }, [t]);

  return (
    <MarketingInnerPage>
      <div className="mkt-hiw">
        <header className="mkt-hiw-hero">
          <p className="mkt-hiw-eyebrow">{t('marketing.howItWorks.eyebrow')}</p>
          <h1 className="mkt-hiw-title">{t('marketing.howItWorks.title')}</h1>
          <p className="mkt-hiw-lead">{t('marketing.howItWorks.lead')}</p>
          <ul className="mkt-hiw-badges">
            {custodyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </header>

        <section className="mkt-hiw-section" aria-labelledby="hiw-fund-title">
          <div
            className="mkt-hiw-stats-card"
            role="group"
            aria-label={`${t('marketing.howItWorks.arbitrum.minDepositLabel')}; ${t('marketing.howItWorks.arbitrum.startBotLabel')}`}
          >
            <div className="mkt-hiw-stats-card-head">
              <div className="mkt-hiw-brand" aria-hidden>
                <img src={ARBITRUM_LOGO} alt="" className="mkt-hiw-brand-logo" loading="lazy" />
                <img
                  src={USDC_LOGO}
                  alt=""
                  className="mkt-hiw-brand-logo mkt-hiw-brand-logo--usdc"
                  loading="lazy"
                />
              </div>
              <h2 id="hiw-fund-title" className="mkt-hiw-h2">
                {t('marketing.howItWorks.arbitrum.title')}
              </h2>
              <p className="mkt-hiw-line">{t('marketing.howItWorks.arbitrum.text')}</p>
            </div>

            <div className="mkt-hiw-stats-row">
              <div className="mkt-hiw-stat">
                <p className="mkt-hiw-stat-value">
                  {t('marketing.howItWorks.arbitrum.minDepositValue')}
                </p>
                <p className="mkt-hiw-stat-label">
                  {t('marketing.howItWorks.arbitrum.minDepositLabel')}
                </p>
              </div>
              <div className="mkt-hiw-stat-divider" aria-hidden />
              <div className="mkt-hiw-stat">
                <p className="mkt-hiw-stat-value">
                  {t('marketing.howItWorks.arbitrum.startBotValue')}
                </p>
                <p className="mkt-hiw-stat-label">
                  {t('marketing.howItWorks.arbitrum.startBotLabel')}
                </p>
              </div>
            </div>
          </div>

          <p className="mkt-hiw-meta">{t('marketing.howItWorks.arbitrum.gas')}</p>

          <aside
            className="mkt-hiw-warn"
            aria-label={t('marketing.howItWorks.arbitrum.doNotUse')}
          >
            <div className="mkt-hiw-warn-head">
              <ShieldAlert size={22} strokeWidth={1.75} aria-hidden />
              <p>{t('marketing.howItWorks.arbitrum.doNotUse')}</p>
            </div>
            <ul>
              {HL_DEPOSIT_DO_NOT_USE.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="mkt-hiw-section" aria-labelledby="hiw-steps-title">
          <div className="mkt-hiw-section-head">
            <h2 id="hiw-steps-title" className="mkt-hiw-h2">
              {t('marketing.howItWorks.stepsTitle')}
            </h2>
            <p className="mkt-hiw-line">{t('marketing.howItWorks.stepsSub')}</p>
          </div>
          <ol className="mkt-hiw-steps">
            {steps.map((step, i) => (
              <li key={step.title} className="mkt-hiw-step">
                <span className="mkt-hiw-step-num" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="mkt-hiw-step-copy">
                  <h3 className="mkt-hiw-step-title">{step.title}</h3>
                  <p className="mkt-hiw-step-text">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="bot-settings"
          className="mkt-hiw-section"
          aria-labelledby="hiw-settings-title"
        >
          <div className="mkt-hiw-section-head">
            <h2 id="hiw-settings-title" className="mkt-hiw-h2">
              {t('marketing.howItWorks.settingsTitle')}
            </h2>
            <p className="mkt-hiw-line">{t('marketing.howItWorks.settingsSub')}</p>
          </div>
          <ul className="mkt-hiw-grid">
            {settings.map((item, i) => {
              const Icon = SETTINGS_ICONS[i] ?? Gauge;
              return (
                <li key={item.title} className="mkt-hiw-tile">
                  <div className="mkt-hiw-tile-icon" aria-hidden>
                    <Icon size={22} strokeWidth={1.75} />
                  </div>
                  <h3 className="mkt-hiw-tile-title">{item.title}</h3>
                  <p className="mkt-hiw-tile-text">{item.text}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="funds" className="mkt-hiw-section" aria-labelledby="hiw-funds-title">
          <div className="mkt-hiw-section-head">
            <h2 id="hiw-funds-title" className="mkt-hiw-h2">
              {t('marketing.howItWorks.fundsTitle')}
            </h2>
            <p className="mkt-hiw-line">{t('marketing.howItWorks.fundsSub')}</p>
          </div>
          <ul className="mkt-hiw-grid">
            {funds.map((item, i) => {
              const Icon = FUND_ICONS[i] ?? Wallet;
              return (
                <li key={item.title} className="mkt-hiw-tile">
                  <div className="mkt-hiw-tile-icon" aria-hidden>
                    <Icon size={22} strokeWidth={1.75} />
                  </div>
                  <h3 className="mkt-hiw-tile-title">{item.title}</h3>
                  <p className="mkt-hiw-tile-text">{item.text}</p>
                </li>
              );
            })}
          </ul>

          <aside className="mkt-hiw-warn mkt-hiw-warn--risks">
            <div className="mkt-hiw-warn-head">
              <AlertTriangle size={22} strokeWidth={1.75} aria-hidden />
              <p>{t('marketing.howItWorks.risksTitle')}</p>
            </div>
            <ul>
              {risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </aside>
        </section>
      </div>
    </MarketingInnerPage>
  );
};

export default HowItWorksPage;
