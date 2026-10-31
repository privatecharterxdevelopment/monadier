import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Layers,
  Loader2,
  MessageCircle,
  Rocket,
  Search,
  Send,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { submitSupportMessage } from '../../lib/supportMessage';
import {
  fetchMyOpenSupportRequest,
  fetchSupportMessages,
  sendSupportChatReply,
  subscribeSupportMessages,
  type SupportMessageRow,
} from '../../lib/supportChat';
import type { SupportRequestRow } from '../../lib/adminSupportRequests';
import type { LandingFaqItem } from '../../lib/supportFaq';
import SupportBrandBubble from './SupportBrandBubble';

type Props = {
  onRequireSignIn?: (reason: string) => void;
};

type FaqTab = 'all' | 'platform' | 'bot' | 'betting' | 'vault';
type View = 'home' | 'topic' | 'chat';

const TOPIC_META: {
  id: Exclude<FaqTab, 'all'>;
  Icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  blurb: string;
}[] = [
  { id: 'platform', Icon: BookOpen, blurb: 'Learn the basics.' },
  { id: 'bot', Icon: Sparkles, blurb: 'Agent settings & trailing.' },
  { id: 'vault', Icon: Shield, blurb: 'Deposits, custody, fees.' },
  { id: 'betting', Icon: CircleDollarSign, blurb: 'Outcome markets on HL.' },
];

const ProTradeSupport: React.FC<Props> = ({ onRequireSignIn }) => {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const [view, setView] = useState<View>('home');
  const [topic, setTopic] = useState<FaqTab>('all');
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const [ticket, setTicket] = useState<SupportRequestRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const knownMsgIdsRef = useRef<Set<string>>(new Set());
  const [animateIds, setAnimateIds] = useState<Set<string>>(() => new Set());
  const [isNarrow, setIsNarrow] = useState(false);

  const displayEmail = profile?.email || user?.email || '—';
  const displayName = profile?.full_name || profile?.username || '—';

  const closeChat = useCallback(() => {
    setView('home');
    setError(null);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!(view === 'chat' && isNarrow)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeChat();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [view, isNarrow, closeChat]);

  const faqs = useMemo(() => {
    const items = t('landing.faq.items', { returnObjects: true });
    return Array.isArray(items) ? (items as LandingFaqItem[]) : [];
  }, [t, i18n.language]);

  const topicCounts = useMemo(() => {
    const counts: Record<Exclude<FaqTab, 'all'>, number> = {
      platform: 0,
      bot: 0,
      betting: 0,
      vault: 0,
    };
    for (const item of faqs) {
      if (item.tab in counts) counts[item.tab as Exclude<FaqTab, 'all'>] += 1;
    }
    return counts;
  }, [faqs]);

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faqs.filter((f) => {
      if (topic !== 'all' && f.tab !== topic) return false;
      if (!q) return true;
      return f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q);
    });
  }, [faqs, topic, query]);

  const scrollThread = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const loadChat = useCallback(async () => {
    if (!user) {
      setTicket(null);
      setMessages([]);
      return;
    }
    setChatLoading(true);
    setError(null);
    const open = await fetchMyOpenSupportRequest();
    if (open.error?.includes('support_requests') || open.error?.includes('relation')) {
      setError(open.error);
      setTicket(null);
      setMessages([]);
      setChatLoading(false);
      return;
    }
    setTicket(open.row);
    if (open.row) {
      const msgs = await fetchSupportMessages(open.row.id);
      if (msgs.error && !msgs.error.includes('support_messages')) setError(msgs.error);
      knownMsgIdsRef.current = new Set(msgs.rows.map((m) => m.id));
      setAnimateIds(new Set());
      setMessages(msgs.rows);
    } else {
      knownMsgIdsRef.current = new Set();
      setAnimateIds(new Set());
      setMessages([]);
    }
    setChatLoading(false);
  }, [user]);

  useEffect(() => {
    void loadChat();
  }, [loadChat]);

  useEffect(() => {
    if (!ticket?.id) return;
    const unsub = subscribeSupportMessages(ticket.id, (row) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        if (row.sender_role === 'admin' && !knownMsgIdsRef.current.has(row.id)) {
          knownMsgIdsRef.current.add(row.id);
          setAnimateIds((ids) => new Set(ids).add(row.id));
        } else {
          knownMsgIdsRef.current.add(row.id);
        }
        return [...prev, row];
      });
    });
    return unsub;
  }, [ticket?.id]);

  useEffect(() => {
    scrollThread();
  }, [messages, animateIds, scrollThread]);

  const handleStartOrSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireSignIn?.(t('auth.signInToSupport'));
      return;
    }
    const text = draft.trim();
    setError(null);
    setSending(true);

    if (ticket) {
      const result = await sendSupportChatReply(ticket.id, text, 'user');
      setSending(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.row) {
        knownMsgIdsRef.current.add(result.row.id);
        setMessages((prev) =>
          prev.some((m) => m.id === result.row!.id) ? prev : [...prev, result.row!]
        );
      }
      setDraft('');
      return;
    }

    const subj =
      text.length > 72
        ? `${text.slice(0, 69).trim()}…`
        : text || t('app.support.chatDefaultSubject', { defaultValue: 'Live chat' });
    const result = await submitSupportMessage({ subject: subj, message: text, channel: 'chat' });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft('');
    await loadChat();
  };

  const topicLabel = (tab: FaqTab) =>
    tab === 'all' ? t('landing.faq.tabs.all') : t(`landing.faq.tabs.${tab}`);

  const openTopic = (id: FaqTab) => {
    setTopic(id);
    setView('topic');
    setOpenFaq(null);
  };

  const chatSection = (
    <section
      className={`hl-help-docs__chat${isNarrow ? ' hl-help-docs__chat--sheet' : ''}`}
      role={isNarrow ? 'dialog' : undefined}
      aria-modal={isNarrow ? true : undefined}
      aria-label={t('app.support.liveChatTitle')}
    >
      <header className="hl-help-docs__chat-head hl-help-docs__chat-head--bar">
        <div className="hl-help-docs__chat-head-row">
          <div className="hl-help-docs__chat-head-copy">
            <h2>{t('app.support.liveChatTitle')}</h2>
            <p>
              {ticket
                ? t('app.support.liveChatActive', { subject: ticket.subject })
                : t('app.support.liveChatLead')}
            </p>
          </div>
          <button
            type="button"
            className="hl-help-docs__chat-close"
            onClick={closeChat}
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        {user ? (
          <p className="hl-help-docs__chat-as">
            <span>{t('app.support.sendingAs')}</span>
            {displayName} · {displayEmail}
          </p>
        ) : null}
      </header>

      {!user ? (
        <div className="hl-help-chat__gate">
          <p className="hl-support-lead">{t('app.support.guestLead')}</p>
          <button
            type="button"
            className="hl-support-primary"
            onClick={() => onRequireSignIn?.(t('auth.signInToSupport'))}
          >
            {t('app.support.signInForHelp')}
          </button>
        </div>
      ) : (
        <>
          <div className="hl-help-chat__thread" ref={threadRef}>
            {chatLoading ? (
              <p className="hl-help-chat__empty">
                <Loader2 size={16} className="hl-spin" aria-hidden />
                {t('app.support.chatLoading')}
              </p>
            ) : messages.length === 0 ? (
              <p className="hl-help-chat__empty">{t('app.support.chatEmpty')}</p>
            ) : (
              messages.map((m) =>
                m.sender_role === 'admin' ? (
                  <SupportBrandBubble
                    key={m.id}
                    body={m.body}
                    createdAt={m.created_at}
                    roleLabel={t('app.support.roleSupport')}
                    animate={animateIds.has(m.id)}
                  />
                ) : (
                  <div key={m.id} className="hl-help-chat__msg hl-help-chat__msg--user">
                    <div className="hl-help-chat__bubble hl-help-chat__bubble--user">
                      <span className="hl-help-chat__bubble-role">{t('app.support.roleYou')}</span>
                      <p>{m.body}</p>
                      <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString()}</time>
                    </div>
                  </div>
                )
              )
            )}
          </div>
          <form
            className="hl-help-chat__composer hl-help-chat__composer--modern"
            onSubmit={(e) => void handleStartOrSend(e)}
          >
            {error ? (
              <p className="hl-support-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="hl-help-chat__composer-row">
              <input
                type="text"
                className="hl-help-chat__composer-input"
                placeholder={t('app.support.chatPlaceholder')}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={5000}
                disabled={sending}
                required
              />
              <button
                type="submit"
                className="hl-help-chat__send"
                disabled={sending || draft.trim().length < 1}
              >
                {sending ? <Loader2 size={16} className="hl-spin" /> : <Send size={16} />}
              </button>
            </div>
          </form>
          <div className="hl-support-hours">
            <Clock size={16} aria-hidden />
            <div>
              <strong>{t('app.support.supportHours')}</strong>
              <p>{t('app.support.supportHoursDetail')}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );

  return (
    <div
      className={`hl-meta-canvas hl-support-page hl-help-center hl-help-docs${
        view === 'chat' ? ' hl-help-docs--chat-open' : ''
      }`}
    >
      <aside className="hl-help-docs__sidebar" aria-label={t('docs.navLabel', { defaultValue: 'Documentation' })}>
        <div className="hl-help-docs__side-section">
          <p className="hl-help-docs__side-heading">Introduction</p>
          <button
            type="button"
            className={`hl-help-docs__side-link${view === 'home' ? ' is-on' : ''}`}
            onClick={() => {
              setView('home');
              setTopic('all');
              setQuery('');
            }}
          >
            <Layers size={15} aria-hidden />
            <span>Overview</span>
          </button>
          <button
            type="button"
            className={`hl-help-docs__side-link${view === 'topic' && topic === 'platform' ? ' is-on' : ''}`}
            onClick={() => openTopic('platform')}
          >
            <BookOpen size={15} aria-hidden />
            <span>{topicLabel('platform')}</span>
            <span className="hl-help-docs__side-count">{topicCounts.platform}</span>
          </button>
        </div>

        <div className="hl-help-docs__side-section">
          <p className="hl-help-docs__side-heading">Product</p>
          {TOPIC_META.filter((x) => x.id !== 'platform').map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              className={`hl-help-docs__side-link${view === 'topic' && topic === id ? ' is-on' : ''}`}
              onClick={() => openTopic(id)}
            >
              <Icon size={15} aria-hidden />
              <span>{topicLabel(id)}</span>
              <span className="hl-help-docs__side-count">{topicCounts[id]}</span>
            </button>
          ))}
        </div>

        <div className="hl-help-docs__side-section">
          <p className="hl-help-docs__side-heading">Support</p>
          <button
            type="button"
            className={`hl-help-docs__side-link${view === 'chat' ? ' is-on' : ''}`}
            onClick={() => setView('chat')}
          >
            <MessageCircle size={15} aria-hidden />
            <span>{t('app.support.liveChatTitle')}</span>
            <ChevronRight size={14} aria-hidden />
          </button>
        </div>
      </aside>

      <div className="hl-help-docs__main">
        {view !== 'chat' ? (
          <>
            <label className="hl-help-docs__search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (view === 'home') setView('topic');
                  if (topic === 'all' && e.target.value) setTopic('all');
                }}
                placeholder={t('app.support.searchPlaceholder')}
                aria-label={t('app.support.searchPlaceholder')}
              />
            </label>

            {view === 'home' && !query.trim() ? (
              <>
                <button type="button" className="hl-help-docs__callout" onClick={() => openTopic('platform')}>
                  <span className="hl-help-docs__callout-icon" aria-hidden>
                    <Rocket size={18} />
                  </span>
                  <span className="hl-help-docs__callout-copy">
                    <strong>{t('app.support.familiarTitle', { defaultValue: 'Get started with HyperGain' })}</strong>
                    <span>{t('app.support.liveChatLead')}</span>
                  </span>
                  <span className="hl-help-docs__callout-cta">{t('docs.learnMore', { defaultValue: 'Learn more' })}</span>
                </button>

                <header className="hl-help-docs__hero">
                  <h1>
                    <Trans
                      i18nKey="docs.title"
                      defaults="HyperGain <0>Documentation</0>"
                      components={[<em className="hl-help-docs__em" key="em" />]}
                    />
                  </h1>
                  <p>{t('docs.lead', { defaultValue: 'Guides for the non-custodial Hyperliquid AI trading agent.' })}</p>
                </header>

                <section className="hl-help-docs__familiar">
                  <h2>{t('docs.familiar', { defaultValue: 'Get familiar with HyperGain' })}</h2>
                  <div className="hl-help-docs__familiar-grid">
                    {TOPIC_META.map(({ id, Icon, blurb }) => (
                      <button key={id} type="button" className="hl-help-docs__familiar-card" onClick={() => openTopic(id)}>
                        <span className="hl-help-docs__familiar-icon" aria-hidden>
                          <Icon size={18} />
                        </span>
                        <span className="hl-help-docs__familiar-copy">
                          <strong>{topicLabel(id)}</strong>
                          <span>{blurb}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <section className="hl-help-docs__articles">
                <header className="hl-help-docs__articles-head">
                  <h2>{topic === 'all' ? t('app.support.articlesTitle') : topicLabel(topic)}</h2>
                  <p>
                    {topic === 'all'
                      ? t('app.support.articlesAll')
                      : t('app.support.articlesInTopic', { topic: topicLabel(topic) })}
                  </p>
                </header>
                <div className="hl-help-docs__articles-list">
                  {filteredFaqs.length === 0 ? (
                    <p className="hl-help-articles__empty">{t('landing.faq.searchEmpty')}</p>
                  ) : (
                    filteredFaqs.map((item) => {
                      const open = openFaq === item.q;
                      return (
                        <article key={item.q} className={`hl-help-faq${open ? ' hl-help-faq--open' : ''}`}>
                          <button
                            type="button"
                            className="hl-help-faq__q"
                            aria-expanded={open}
                            onClick={() => setOpenFaq(open ? null : item.q)}
                          >
                            <span>
                              <span className="hl-help-faq__tag">{topicLabel(item.tab as FaqTab)}</span>
                              {item.q}
                            </span>
                            <ChevronDown size={16} aria-hidden />
                          </button>
                          {open ? <p className="hl-help-faq__a">{item.a}</p> : null}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            )}
          </>
        ) : isNarrow ? null : (
          chatSection
        )}
      </div>
      {view === 'chat' && isNarrow && typeof document !== 'undefined'
        ? createPortal(
            chatSection,
            document.querySelector('.hl-root') ?? document.body
          )
        : null}
    </div>
  );
};

export default ProTradeSupport;
