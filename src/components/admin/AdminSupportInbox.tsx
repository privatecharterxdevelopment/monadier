import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import {
  fetchAdminSupportRequests,
  resolveSupportRequest,
  reopenSupportRequest,
  type SupportRequestRow,
} from '../../lib/adminSupportRequests';
import {
  fetchSupportMessages,
  sendSupportChatReply,
  subscribeSupportInbox,
  subscribeSupportMessages,
  type SupportMessageRow,
} from '../../lib/supportChat';
import { formatTimeAgo, shortWallet } from '../../lib/adminDashboard';

type Props = {
  refreshAt?: Date;
  /** Compact overview card — list preview + jump to full inbox */
  variant?: 'inbox' | 'overview';
  onOpenInbox?: () => void;
};

function userLabel(row: SupportRequestRow): string {
  return (
    row.user_email ||
    row.user_username ||
    row.user_full_name ||
    shortWallet(row.wallet_address ?? '', 6) ||
    'User'
  );
}

const AdminSupportInbox: React.FC<Props> = ({
  refreshAt,
  variant = 'inbox',
  onOpenInbox,
}) => {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [rows, setRows] = useState<SupportRequestRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchAdminSupportRequests({
      status: filter,
      limit: variant === 'overview' ? 8 : 80,
    });
    if (result.error) {
      setLoadError(result.error);
      setRows([]);
    } else {
      setRows(result.rows);
    }
    setLoading(false);
  }, [filter, variant]);

  useEffect(() => {
    void load();
  }, [load, refreshAt]);

  useEffect(() => {
    return subscribeSupportInbox(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (variant === 'overview') return;
    if (!selectedId && rows.length > 0) {
      const open = rows.find((r) => r.status === 'open');
      setSelectedId((open ?? rows[0]).id);
    }
  }, [rows, selectedId, variant]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const loadMessages = useCallback(async (requestId: string) => {
    setMessagesLoading(true);
    const result = await fetchSupportMessages(requestId);
    if (result.error) {
      setLoadError(result.error);
      setMessages([]);
    } else {
      setMessages(result.rows);
    }
    setMessagesLoading(false);
  }, []);

  useEffect(() => {
    if (variant === 'overview' || !selectedId) {
      setMessages([]);
      setReply('');
      return;
    }
    void loadMessages(selectedId);
    const unsub = subscribeSupportMessages(selectedId, (row) => {
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    });
    return unsub;
  }, [selectedId, loadMessages, variant]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, messagesLoading]);

  const openCount = rows.filter((r) => r.status === 'open').length;

  const handleReply = async () => {
    if (!selectedId) return;
    const text = reply.trim();
    if (!text) return;
    setReplyBusy(true);
    const result = await sendSupportChatReply(selectedId, text, 'admin');
    setReplyBusy(false);
    if (result.error) {
      setLoadError(result.error);
      return;
    }
    if (result.row) {
      setMessages((prev) =>
        prev.some((m) => m.id === result.row!.id) ? prev : [...prev, result.row!]
      );
    }
    setReply('');
    await load();
  };

  const handleResolve = async (id: string) => {
    setBusyId(id);
    const result = await resolveSupportRequest(id);
    if (!result.ok) setLoadError(result.error ?? 'Could not resolve');
    else await load();
    setBusyId(null);
  };

  const handleReopen = async (id: string) => {
    setBusyId(id);
    const result = await reopenSupportRequest(id);
    if (!result.ok) setLoadError(result.error ?? 'Could not reopen');
    else await load();
    setBusyId(null);
  };

  if (variant === 'overview') {
    return (
      <div className="rounded-xl border border-border bg-card-dark p-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <MessageCircle size={18} className="text-cyan-400" />
          <h3 className="font-semibold text-primary">Live chats</h3>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">
            {openCount} open
          </span>
        </div>
        <p className="text-xs text-secondary mb-3">
          User Help Center chats · realtime
        </p>
        {loadError ? (
          <p className="text-xs text-amber-400 mb-2" role="alert">
            {loadError}
          </p>
        ) : null}
        <div className="max-h-[220px] overflow-y-auto divide-y divide-border -mx-1 mb-3">
          {loading ? (
            <p className="text-sm text-secondary py-5 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-secondary py-5 text-center">No open chats</p>
          ) : (
            rows.slice(0, 6).map((row) => (
              <button
                key={row.id}
                type="button"
                className="w-full text-left py-2.5 px-1 hover:bg-black/[0.03] transition-colors"
                onClick={() => onOpenInbox?.()}
              >
                <div className="flex items-start gap-2">
                  <span className="text-[11px] text-secondary w-12 shrink-0 pt-0.5">
                    {formatTimeAgo(row.created_at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-primary truncate">{row.subject}</p>
                    <p className="text-xs text-secondary truncate">{userLabel(row)}</p>
                    <p className="text-xs text-secondary/80 line-clamp-1 mt-0.5">{row.message}</p>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                      row.status === 'open'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-green-500/15 text-green-400'
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenInbox?.()}
          className="w-full text-sm font-medium py-2 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20"
        >
          Open chat inbox
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card-dark overflow-hidden min-h-[560px] flex flex-col">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
        <MessageCircle size={18} className="text-cyan-400" />
        <h3 className="font-semibold text-primary">Support chats</h3>
        <span className="text-xs text-secondary">left = threads · right = live reply</span>
        <div className="ml-auto flex gap-1.5">
          {(['open', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`text-xs px-2.5 py-1 rounded-md border ${
                filter === f
                  ? 'border-cyan-500/50 text-cyan-400 bg-cyan-500/10'
                  : 'border-border text-secondary'
              }`}
              onClick={() => setFilter(f)}
            >
              {f === 'open' ? `Open (${openCount})` : 'All'}
            </button>
          ))}
        </div>
      </div>

      {loadError ? (
        <p className="text-xs text-amber-400 px-4 py-2" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,0.9fr)_minmax(0,1.4fr)] flex-1 min-h-0">
        <aside className="border-b lg:border-b-0 lg:border-r border-border max-h-[280px] lg:max-h-none overflow-y-auto">
          {loading ? (
            <p className="text-sm text-secondary py-8 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-secondary py-8 text-center">No chats</p>
          ) : (
            rows.map((row) => {
              const on = selectedId === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full text-left px-3 py-3 border-b border-border transition-colors ${
                    on ? 'bg-cyan-500/10' : 'hover:bg-black/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] text-secondary">{formatTimeAgo(row.created_at)}</span>
                    <span
                      className={`ml-auto text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        row.status === 'open'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-green-500/15 text-green-400'
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-primary truncate">{row.subject}</p>
                  <p className="text-xs text-secondary truncate">{userLabel(row)}</p>
                </button>
              );
            })
          )}
        </aside>

        <section className="flex flex-col min-h-[360px]">
          {!selected ? (
            <p className="m-auto text-sm text-secondary">Select a chat</p>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border flex flex-wrap gap-3 items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-primary">{selected.subject}</p>
                  <p className="text-xs text-secondary mt-0.5">
                    {userLabel(selected)}
                    {selected.channel ? ` · ${selected.channel}` : ''}
                  </p>
                  <p className="text-[11px] text-secondary mt-1 font-mono break-all">
                    {selected.user_email || '—'} · {selected.wallet_address || 'no wallet'}
                  </p>
                </div>
                {selected.status === 'open' ? (
                  <button
                    type="button"
                    disabled={busyId === selected.id}
                    className="text-xs px-2.5 py-1 rounded-md bg-green-500/15 text-green-400 border border-green-500/30 disabled:opacity-50"
                    onClick={() => void handleResolve(selected.id)}
                  >
                    Resolve
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === selected.id}
                    className="text-xs px-2.5 py-1 rounded-md border border-border text-secondary disabled:opacity-50"
                    onClick={() => void handleReopen(selected.id)}
                  >
                    Reopen
                  </button>
                )}
              </div>

              <div ref={threadRef} className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
                {messagesLoading ? (
                  <p className="text-xs text-secondary text-center py-6">Loading thread…</p>
                ) : messages.length === 0 ? (
                  <p className="text-xs text-secondary whitespace-pre-wrap">{selected.message}</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg px-3 py-2 text-sm max-w-[92%] ${
                        m.sender_role === 'admin'
                          ? 'bg-cyan-500/10 border border-cyan-500/20 ml-0'
                          : 'bg-black/25 border border-border ml-auto'
                      }`}
                    >
                      <p className="text-[10px] uppercase tracking-wide text-secondary mb-0.5">
                        {m.sender_role === 'admin' ? 'You (support)' : 'User'} ·{' '}
                        {formatTimeAgo(m.created_at)}
                      </p>
                      <p className="text-primary/90 whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 border-t border-border flex gap-2">
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Reply live…"
                  className="flex-1 text-sm rounded-lg border border-border bg-black/30 px-3 py-2 text-primary"
                  disabled={replyBusy || selected.status === 'resolved'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleReply();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={replyBusy || !reply.trim() || selected.status === 'resolved'}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 disabled:opacity-50"
                  onClick={() => void handleReply()}
                >
                  <Send size={14} aria-hidden />
                  {replyBusy ? '…' : 'Send'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminSupportInbox;
