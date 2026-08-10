import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  CircleDollarSign,
  Clock,
  Headphones,
  Layers,
  Loader2,
  MessageCircle,
  Search,
  Send,
  Ticket,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

const TOPIC_CARDS: {
  id: Exclude<FaqTab, 'all'>;
  Icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
}[] = [
  { id: 'platform', Icon: Layers },
  { id: 'bot', Icon: Bot },
  { id: 'betting', Icon: Ticket },
  { id: 'vault', Icon: CircleDollarSign },
];

const ProTradeSupport: React.FC<Props> = ({ onRequireSignIn }) => {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const [topic, setTopic] = useState<FaqTab>('all');
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const [ticket, setTicket] = useState<SupportRequestRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [subject, setSubject] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const knownMsgIdsRef = useRef<Set<string>>(new Set());
  const [animateIds, setAnimateIds] = useState<Set<string>>(() => new Set());

  const displayEmail = profile?.email || user?.email || '—';
  const displayName = profile?.full_name || profile?.username || '—';

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
      if (item.tab in counts) {
        counts[item.tab as Exclude<FaqTab, 'all'>] += 1;
      }
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
      if (msgs.error && !msgs.error.includes('support_messages')) {
        setError(msgs.error);
      }
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
      subject.trim() ||
      t('app.support.chatDefaultSubject', { defaultValue: 'Live chat' });
    const result = await submitSupportMessage({
      subject: subj,
      message: text,
      channel: 'chat',
    });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft('');
    setSubject('');
    await loadChat();
  };

  const topicLabel = (tab: FaqTab) =>
    tab === 'all' ? t('landing.faq.tabs.all') : t(`landing.faq.tabs.${tab}`);

  return (
    <div className="hl-meta-canvas hl-support-page hl-help-center">
      <header className="hl-help-center__hero">
        <div className="hl-help-center__hero-top">
          <div className="hl-help-center__hero-icon" aria-hidden>
            <Headphones size={22} />
          </div>
          <div className="hl-help-center__hero-copy">
            <h1 className="hl-help-center__title">{t('app.support.helpTitle')}</h1>
            <p className="hl-help-center__lead">{t('app.support.helpLead')}</p>
          </div>
        </div>
        <label className="hl-help-center__search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('app.support.searchPlaceholder')}
            aria-label={t('app.support.searchPlaceholder')}
          />
        </label>
      </header>

      <div className="hl-help-center__topics" role="list">
        <button
          type="button"
          role="listitem"
          className={`hl-help-topic-card${topic === 'all' ? ' hl-help-topic-card--on' : ''}`}
          onClick={() => {
            setTopic('all');
            setOpenFaq(null);
          }}
        >
          <span className="hl-help-topic-card__icon" aria-hidden>
            <Layers size={18} />
          </span>
          <span className="hl-help-topic-card__body">
            <strong>{topicLabel('all')}</strong>
            <span>{t('app.support.articleCount', { count: faqs.length })}</span>
          </span>
        </button>
        {TOPIC_CARDS.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            role="listitem"
            className={`hl-help-topic-card${topic === id ? ' hl-help-topic-card--on' : ''}`}
            onClick={() => {
              setTopic(id);
              setOpenFaq(null);
            }}
          >
            <span className="hl-help-topic-card__icon" aria-hidden>
              <Icon size={18} />
            </span>
            <span className="hl-help-topic-card__body">
              <strong>{topicLabel(id)}</strong>
              <span>{t('app.support.articleCount', { count: topicCounts[id] })}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="hl-help-center__grid">
        <section className="hl-help-articles" aria-labelledby="hl-help-articles-title">
          <header className="hl-help-articles__head">
            <h2 id="hl-help-articles-title">{t('app.support.articlesTitle')}</h2>
            <p>
              {topic === 'all'
                ? t('app.support.articlesAll')
                : t('app.support.articlesInTopic', { topic: topicLabel(topic) })}
            </p>
          </header>
          <div className="hl-help-articles__list" role="region" aria-live="polite">
            {filteredFaqs.length === 0 ? (
              <p className="hl-help-articles__empty">{t('landing.faq.searchEmpty')}</p>
            ) : (
              filteredFaqs.map((item) => {
                const open = openFaq === item.q;
                return (
                  <article
                    key={item.q}
                    className={`hl-help-faq${open ? ' hl-help-faq--open' : ''}`}
                  >
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

        <aside className="hl-help-chat" aria-labelledby="hl-help-chat-title">
          <header className="hl-help-chat__head">
            <MessageCircle size={18} aria-hidden />
            <div>
              <h2 id="hl-help-chat-title">{t('app.support.liveChatTitle')}</h2>
              <p>
                {ticket
                  ? t('app.support.liveChatActive', { subject: ticket.subject })
                  : t('app.support.liveChatLead')}
              </p>
            </div>
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
              <p className="hl-support-note">{t('app.support.securityNote')}</p>
            </div>
          ) : (
            <>
              <div className="hl-help-chat__meta">
                <p className="hl-support-user-label">{t('app.support.sendingAs')}</p>
                <p className="hl-support-user-value">
                  {displayName} · {displayEmail}
                </p>
              </div>

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
                          <time dateTime={m.created_at}>
                            {new Date(m.created_at).toLocaleString()}
                          </time>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>

              <form className="hl-help-chat__composer" onSubmit={(e) => void handleStartOrSend(e)}>
                {!ticket ? (
                  <input
                    type="text"
                    className="hl-support-input"
                    placeholder={t('app.support.subjectPlaceholder')}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={120}
                    disabled={sending}
                    aria-label={t('app.support.subject')}
                  />
                ) : null}
                <textarea
                  className="hl-support-textarea hl-help-chat__input"
                  placeholder={t('app.support.chatPlaceholder')}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={5000}
                  rows={3}
                  disabled={sending}
                  required
                />
                {error ? (
                  <p className="hl-support-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="hl-support-primary"
                  disabled={sending || draft.trim().length < (ticket ? 1 : 10)}
                >
                  {sending ? (
                    <>
                      <Loader2 size={16} className="hl-spin" aria-hidden />
                      {t('app.support.sending')}
                    </>
                  ) : (
                    <>
                      <Send size={16} aria-hidden />
                      {ticket ? t('app.support.sendReply') : t('app.support.startChat')}
                    </>
                  )}
                </button>
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
        </aside>
      </div>
    </div>
  );
};

export default ProTradeSupport;
