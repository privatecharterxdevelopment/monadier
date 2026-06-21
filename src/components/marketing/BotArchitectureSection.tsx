import React from 'react';
import {
  BOT_ARCHITECTURE_FEATURES,
  BOT_ARCHITECTURE_GOAL,
  BOT_ARCHITECTURE_LEAD,
  BOT_ARCHITECTURE_TITLE,
} from '../../lib/marketingBotArchitecture';
import { MarketingSectionHeading } from './MarketingInnerPage';

const BotArchitectureSection: React.FC = () => {
  return (
    <>
      <MarketingSectionHeading title={BOT_ARCHITECTURE_TITLE} sub={BOT_ARCHITECTURE_LEAD} />
      <ul className="mkt-architecture-list">
        {BOT_ARCHITECTURE_FEATURES.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <p className="mkt-architecture-goal">{BOT_ARCHITECTURE_GOAL}</p>
    </>
  );
};

export default BotArchitectureSection;
