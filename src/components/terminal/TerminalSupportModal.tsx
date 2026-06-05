import React from 'react';
import { Mail, Clock, MessageCircle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import TerminalModalFrame from './TerminalModalFrame';

type Props = {
  onClose: () => void;
};

const TerminalSupportModal: React.FC<Props> = ({ onClose }) => {
  return (
    <TerminalModalFrame
      title="Support"
      subtitle="We're here to help with trading, vault, and bot questions."
      onClose={onClose}
      icon={<MessageCircle size={18} />}
    >
      <div className="term-support-modal">
        <div className="term-support-card">
          <Mail size={20} className="term-support-card-icon" aria-hidden />
          <div>
            <h3 className="term-support-card-title">Email support</h3>
            <p className="term-modal-hint">
              Send us a message and we&apos;ll get back to you within 24 hours.
            </p>
            <a href="mailto:support@monadier.com" className="term-support-email">
              support@monadier.com
            </a>
          </div>
        </div>

        <div className="term-support-card">
          <Clock size={20} className="term-support-card-icon" aria-hidden />
          <div>
            <h3 className="term-support-card-title">Support hours</h3>
            <p className="term-modal-hint">
              Monday – Friday, 9:00 – 18:00 CET. Elite plans include extended coverage.
            </p>
          </div>
        </div>

        <p className="term-support-note">
          For security, we do not offer support via Telegram. Use email or your plan&apos;s Discord /
          phone channel.
        </p>

        <Link
          to="/support"
          className="term-support-link"
          onClick={onClose}
        >
          Visit support center
          <ExternalLink size={14} />
        </Link>
      </div>
    </TerminalModalFrame>
  );
};

export default TerminalSupportModal;
