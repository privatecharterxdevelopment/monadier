import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { goToOpenApp, goToOpenAppRegister } from '../../lib/appUrls';
import {
  LANDING_ASSIST_WELCOME,
  answerLandingAssist,
  type AssistReply,
} from '../../lib/landingAssistKnowledge';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  handoff?: boolean;
};

const LandingAssistWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'welcome', role: 'assistant', text: LANDING_ASSIST_WELCOME },
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [open, messages, typing]);

  const pushAssistant = (reply: AssistReply) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: reply.text,
        handoff: reply.handoff,
      },
    ]);
  };

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || typing) return;
    setInput('');
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
    setTyping(true);
    window.setTimeout(() => {
      pushAssistant(answerLandingAssist(text));
      setTyping(false);
    }, 480 + Math.min(900, text.length * 12));
  };

  return (
    <div className="landing-assist" aria-live="polite">
      {open ? (
        <div className="landing-assist-panel" role="dialog" aria-label="HyperGain assistant">
          <div className="landing-assist-panel-glow" aria-hidden />
          <header className="landing-assist-panel-head">
            <div className="landing-assist-panel-title-row">
              <span className="landing-assist-dot" aria-hidden />
              <div>
                <p className="landing-assist-panel-title">Questions?</p>
                <p className="landing-assist-panel-sub">HyperGain assistant · online</p>
              </div>
            </div>
            <button
              type="button"
              className="landing-assist-icon-btn"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <X size={14} strokeWidth={2.25} />
            </button>
          </header>

          <div className="landing-assist-messages">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`landing-assist-bubble landing-assist-bubble--${m.role}`}
              >
                <p>{m.text}</p>
                {m.handoff ? (
                  <button
                    type="button"
                    className="landing-assist-handoff-cta"
                    onClick={() => goToOpenAppRegister(false)}
                  >
                    Register now for free and talk to support
                  </button>
                ) : null}
              </div>
            ))}
            {typing ? (
              <div className="landing-assist-bubble landing-assist-bubble--assistant landing-assist-typing">
                <span />
                <span />
                <span />
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            className="landing-assist-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about HyperGain…"
              className="landing-assist-input"
              autoComplete="off"
            />
            <button
              type="submit"
              className="landing-assist-send"
              disabled={!input.trim() || typing}
              aria-label="Send"
            >
              <Send size={14} strokeWidth={2.25} />
            </button>
          </form>
        </div>
      ) : null}

      <div className={`landing-assist-dock${open ? ' is-open' : ''}`}>
        <button
          type="button"
          className="landing-assist-cta landing-assist-cta--primary"
          onClick={() => goToOpenApp()}
        >
          Try for free
        </button>
        <button
          type="button"
          className="landing-assist-cta landing-assist-cta--ghost"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <MessageCircle size={13} strokeWidth={2.25} aria-hidden />
          {open ? 'Close' : 'Questions?'}
        </button>
      </div>
    </div>
  );
};

export default LandingAssistWidget;
