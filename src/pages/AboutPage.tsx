import React from 'react';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import CookieConsent from '../components/ui/CookieConsent';
import MarketingSeo from '../components/seo/MarketingSeo';
import MarketingPageBottomCta from '../components/marketing/MarketingPageBottomCta';
import { MarketingPageHero } from '../components/marketing/MarketingInnerPage';
import { MktTeamVisual } from '../components/marketing/MarketingIllustrations';
import { BRAND_NAME, SUPPORT_EMAIL } from '../lib/brand';

const APPLY_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  `${BRAND_NAME} — Team application`
)}`;

const LORENZO_LINKEDIN = 'https://www.linkedin.com/in/lorenzo-vanza-1894b1187';

const AboutPage: React.FC = () => {
  return (
    <div className="landing-gmx min-h-[100dvh] min-h-[100svh]">
      <MarketingSeo path="/about" />
      <LandingNav variant="light" layout="gmx" />

      <main className="landing-gmx-page-main landing-gmx-page-main--inner landing-gmx-gutter">
        <div className="landing-gmx-shell">
          <div className="mkt-page">
            <MarketingPageHero
              eyebrow="Company"
              title={`About ${BRAND_NAME}`}
              lead={`We help people around the world generate passive income — non-custodial Hyperliquid automation you control from your own wallet.`}
              sub="Built in Zug. Simple to run. Designed so the bot works while you live your life."
              aside={<MktTeamVisual />}
            />

            <div className="mkt-prose-grid">
              <div className="mkt-prose-block landing-glass-card">
                <p>
                  {BRAND_NAME} exists for one reason: give anyone with a wallet a clear path to
                  automated trading income — without handing keys to a fund or babysitting charts
                  all day. Connect, fund your Hyperliquid account, set your risk, and let the bot
                  run.
                </p>
              </div>
              <div className="mkt-prose-block landing-glass-card">
                <p>
                  Non-custodial by design: you keep control of deposits and withdrawals. Start the
                  bot, set take profit and stop loss, and optionally use leverage if you know what
                  you&rsquo;re doing. Crypto trading is risky — only use capital you can afford to
                  lose.
                </p>
              </div>
            </div>

            <section className="mkt-about-team" aria-labelledby="mkt-about-team-title">
              <div className="mkt-section-heading">
                <h2 id="mkt-about-team-title" className="mkt-section-title">
                  Team
                </h2>
                <p className="mkt-section-sub">
                  Small team, clear ownership. More faces will be announced as we grow —
                  we&rsquo;re still looking for one more teammate.
                </p>
              </div>

              <div className="mkt-about-team-grid">
                <article className="mkt-about-team-card landing-glass-card">
                  <div className="mkt-about-team-avatar" aria-hidden>
                    LV
                  </div>
                  <div className="mkt-about-team-copy">
                    <h3 className="mkt-about-team-name">
                      <a
                        href={LORENZO_LINKEDIN}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mkt-about-team-name-link"
                      >
                        Mr Lorenzo Vanza
                      </a>
                    </h3>
                    <p className="mkt-about-team-role">
                      Founder of {BRAND_NAME} · Head of Development
                    </p>
                    <p className="mkt-about-team-bio">
                      Based in Zug, Switzerland — building in crypto for years. Before{' '}
                      {BRAND_NAME}, Lorenzo founded PrivateCharterX, a Web3 luxury travel platform
                      with its own AI at the core: jets, charters, and itineraries that feel
                      personal instead of complicated. Same idea here — useful software that runs
                      for people, not a pitch deck.
                    </p>
                    <a
                      href={LORENZO_LINKEDIN}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mkt-cta-secondary mkt-about-team-linkedin"
                    >
                      LinkedIn →
                    </a>
                  </div>
                </article>

                <article className="mkt-about-team-card mkt-about-team-card--open landing-glass-card">
                  <div className="mkt-about-team-avatar mkt-about-team-avatar--open" aria-hidden>
                    ?
                  </div>
                  <div className="mkt-about-team-copy">
                    <h3 className="mkt-about-team-name">Open role</h3>
                    <p className="mkt-about-team-role">To be announced · We&rsquo;re hiring</p>
                    <p className="mkt-about-team-bio">
                      Additional team members will be introduced over time. If you want to help
                      more people earn passively through Hyperliquid automation — and you like
                      shipping with a small team in Zug — get in touch.
                    </p>
                    <a href={APPLY_MAILTO} className="mkt-cta-primary mkt-about-team-apply">
                      Apply to join us
                    </a>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>
      </main>

      <section
        className="landing-gmx-section landing-gmx-gutter mkt-about-philosophy-section"
        aria-labelledby="mkt-about-philosophy-title"
      >
        <div className="landing-gmx-shell mkt-about-philosophy-inner">
          <h2 id="mkt-about-philosophy-title" className="mkt-about-philosophy-title">
            Philosophy
          </h2>
          <p className="mkt-about-philosophy-text">
            Passive income should be accessible globally — not locked behind a trading desk. You
            stay in control of your wallet; we provide the automation. Markets move fast and
            losses are real; only trade what you can afford to lose.
          </p>
        </div>
      </section>

      <MarketingPageBottomCta />

      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default AboutPage;
