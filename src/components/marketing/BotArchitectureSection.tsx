import React from 'react';
import {
  BOT_ARCHITECTURE_FEATURES,
  BOT_ARCHITECTURE_GOAL,
  BOT_ARCHITECTURE_LEAD,
  BOT_ARCHITECTURE_TITLE,
} from '../../lib/marketingBotArchitecture';
import { MarketingFeatureCard, MarketingPageGrid, MarketingSectionHeading } from './MarketingInnerPage';
import { MktBotScanVisual } from './MarketingIllustrations';

const BotArchitectureSection: React.FC = () => {
  return (
    <>
      <MarketingSectionHeading title={BOT_ARCHITECTURE_TITLE} sub={BOT_ARCHITECTURE_LEAD} />
      <MarketingPageGrid columns={2}>
        {BOT_ARCHITECTURE_FEATURES.map((feature, i) => (
          <MarketingFeatureCard
            key={feature}
            index={i}
            title={feature.split('(')[0].trim()}
            text={feature}
            visual={i === 0 ? <MktBotScanVisual /> : i === 5 ? <MktBotScanVisual /> : undefined}
          />
        ))}
      </MarketingPageGrid>
      <p className="mkt-architecture-goal landing-glass-card">{BOT_ARCHITECTURE_GOAL}</p>
    </>
  );
};

export default BotArchitectureSection;
