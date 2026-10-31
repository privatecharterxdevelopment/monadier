import React from 'react';
import { Info } from 'lucide-react';
import TerminalModalFrame from './TerminalModalFrame';
import HlBotSetupSteps from './HlBotSetupSteps';

type Props = {
  walletReady: boolean;
  hlBalanceUsd: number;
  agentApproved: boolean;
  builderFeeApproved: boolean;
  builderFeeEnabled: boolean;
  botRunning: boolean;
  currentStep: 1 | 2 | 3;
  onClose: () => void;
};

const HlBotSetupGuideModal: React.FC<Props> = ({
  walletReady,
  hlBalanceUsd,
  agentApproved,
  builderFeeApproved,
  builderFeeEnabled,
  botRunning,
  currentStep,
  onClose,
}) => (
  <TerminalModalFrame
    title="How the bot works"
    subtitle="Native USDC on Arbitrum only · same wallet as Hyperliquid · all steps in HyperGain."
    icon={<Info size={18} />}
    onClose={onClose}
  >
    <HlBotSetupSteps
      variant="guide"
      walletReady={walletReady}
      hlBalanceUsd={hlBalanceUsd}
      agentApproved={agentApproved}
      builderFeeApproved={builderFeeApproved}
      builderFeeEnabled={builderFeeEnabled}
      botRunning={botRunning}
      currentStep={currentStep}
    />
  </TerminalModalFrame>
);

export default HlBotSetupGuideModal;
