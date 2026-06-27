import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Shield, Wallet, Database } from 'lucide-react';
import MarketingInnerPage, {
  MarketingPageHero,
  MarketingSectionHeading,
  MarketingPageCta,
  MarketingDisclaimer,
  MarketingArbitrumCallout,
  MarketingCompactSteps,
  MarketingFundsList,
} from '../components/marketing/MarketingInnerPage';
import { HL_DEPOSIT_DO_NOT_USE } from '../lib/hlDepositRules';

type StepItem = { title: string; text: string };
type FundItem = { title: string; text: string };

const FUND_ICONS = [Wallet, Shield, Database, Wallet] as const;

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

  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow={t('marketing.howItWorks.eyebrow')}
        title={t('marketing.howItWorks.title')}
        lead={t('marketing.howItWorks.lead')}
        sub={t('marketing.howItWorks.sub')}
      />

      <MarketingArbitrumCallout
        title={t('marketing.howItWorks.arbitrum.title')}
        text={t('marketing.howItWorks.arbitrum.text')}
        minHl={t('marketing.howItWorks.arbitrum.minHl')}
        gas={t('marketing.howItWorks.arbitrum.gas')}
        doNotUseLabel={t('marketing.howItWorks.arbitrum.doNotUse')}
        doNotUseItems={[...HL_DEPOSIT_DO_NOT_USE]}
      />

      <MarketingSectionHeading
        title={t('marketing.howItWorks.stepsTitle')}
        sub={t('marketing.howItWorks.stepsSub')}
      />

      <MarketingCompactSteps steps={steps} />

      <div id="funds" className="mkt-funds-section">
        <MarketingSectionHeading
          title={t('marketing.howItWorks.fundsTitle')}
          sub={t('marketing.howItWorks.fundsSub')}
        />

        <MarketingFundsList
          items={funds.map((item, i) => ({
            ...item,
            icon: FUND_ICONS[i] ?? Wallet,
          }))}
        />

        <article className="mkt-funds-risks landing-glass-card">
          <div className="mkt-funds-risks-head">
            <AlertTriangle size={18} strokeWidth={1.75} aria-hidden />
            <h3>{t('marketing.howItWorks.risksTitle')}</h3>
          </div>
          <ul>
            {risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </article>
      </div>

      <MarketingPageCta secondary={{ to: '/pricing', label: t('marketing.howItWorks.ctaSecondary') }} />

      <MarketingDisclaimer>{t('marketing.howItWorks.disclaimer')}</MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default HowItWorksPage;
