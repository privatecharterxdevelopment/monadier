import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  X as XIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  approveTwitterPost,
  DEFAULT_TWEET_TEMPLATE,
  TWEET_TEMPLATE_PLACEHOLDERS,
  fetchTwitterPosts,
  fetchTwitterSettings,
  getBotAdminSecret,
  rejectTwitterPost,
  setBotAdminSecretSession,
  twitterCredentialsStatus,
  twitterGenerateDraft,
  twitterPublishNow,
  updateTwitterPostBody,
  updateTwitterSettings,
  type TwitterPost,
  type TwitterSettings,
} from '../../lib/adminTwitter';

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'posted'
      ? 'bg-emerald-500/15 text-emerald-400'
      : status === 'draft'
        ? 'bg-amber-500/15 text-amber-400'
        : status === 'approved' || status === 'scheduled'
          ? 'bg-sky-500/15 text-sky-400'
          : status === 'failed'
            ? 'bg-red-500/15 text-red-400'
            : status === 'rejected'
              ? 'bg-black/10 text-secondary'
              : 'bg-black/10 text-secondary';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${tone}`}>
      {status}
    </span>
  );
}

function hoursToInput(hours: number[]): string {
  return hours.join(', ');
}

function parseHours(raw: string, postsPerDay: number): number[] {
  const parsed = raw
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 23)
    .map((n) => Math.floor(n));
  return [...new Set(parsed)].sort((a, b) => a - b).slice(0, Math.max(1, postsPerDay));
}

const AdminTwitterSocial: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<TwitterSettings | null>(null);
  const [posts, setPosts] = useState<TwitterPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [credsOk, setCredsOk] = useState<boolean | null>(null);
  const [hoursDraft, setHoursDraft] = useState('10, 18');
  const [templateDraft, setTemplateDraft] = useState('');
  const [adminSecretDraft, setAdminSecretDraft] = useState('');
  const [bodyDrafts, setBodyDrafts] = useState<Record<string, string>>({});
  const [adminEmail, setAdminEmail] = useState('admin');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAdminSecretDraft(getBotAdminSecret());
    try {
      const [{ data: userData }, s, p, cred] = await Promise.all([
        supabase.auth.getUser(),
        fetchTwitterSettings(),
        fetchTwitterPosts(40),
        twitterCredentialsStatus().catch(() => ({ ok: false as const, configured: false, error: undefined as string | undefined })),
      ]);
      if (userData.user?.email) setAdminEmail(userData.user.email);
      setSettings(s);
      setPosts(p);
      if (s?.post_hours_utc?.length) setHoursDraft(hoursToInput(s.post_hours_utc));
      setTemplateDraft(s?.tweet_template?.trim() ? s.tweet_template : DEFAULT_TWEET_TEMPLATE);
      setCredsOk(cred.ok ? Boolean(cred.configured) : null);
      if (!cred.ok && cred.error) {
        console.warn(cred.error);
      }
      const drafts: Record<string, string> = {};
      for (const row of p) drafts[row.id] = row.body;
      setBodyDrafts(drafts);
    } catch (err) {
      console.error(err);
      setError(
        'Could not load Twitter settings — apply migration 20270113200000 / 20270113210000 / 20270122140000'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(
    () => posts.filter((p) => p.status === 'draft').length,
    [posts]
  );

  const saveSettings = async (patch: Parameters<typeof updateTwitterSettings>[0]) => {
    setBusy(true);
    setError(null);
    try {
      await updateTwitterSettings(patch);
      await load();
    } catch (err) {
      console.error(err);
      setError('Failed to save settings.');
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (
    key: 'enabled' | 'require_approval' | 'win_flyer_enabled',
    value: boolean
  ) => {
    await saveSettings({ [key]: value });
  };

  const onSaveSchedule = async () => {
    if (!settings) return;
    const hours = parseHours(hoursDraft, settings.posts_per_day);
    if (hours.length === 0) {
      setError('Enter at least one UTC hour (0–23), e.g. 10, 18');
      return;
    }
    await saveSettings({
      post_hours_utc: hours,
      posts_per_day: Math.min(6, Math.max(1, hours.length)),
    });
  };

  const onSaveTemplate = async () => {
    const trimmed = templateDraft.trim();
    if (trimmed.length > 500) {
      setError('Template too long (max 500 chars — keep final tweet ≤280 after fill).');
      return;
    }
    await saveSettings({ tweet_template: trimmed || null });
  };

  const onSaveAdminSecret = () => {
    setBotAdminSecretSession(adminSecretDraft);
    setError(null);
    void load();
  };

  const onGenerate = async (kind: 'stats' | 'win_flyer' = 'stats') => {
    setBusy(true);
    setError(null);
    try {
      const result = await twitterGenerateDraft(kind);
      if (!result.ok) {
        setError(result.error ?? 'Generate failed');
        return;
      }
      await load();
    } catch (err) {
      console.error(err);
      setError('Generate failed — check BOT_ADMIN_SECRET / bot-service.');
    } finally {
      setBusy(false);
    }
  };

  const onApprove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const body = bodyDrafts[id];
      if (body && body !== posts.find((p) => p.id === id)?.body) {
        await updateTwitterPostBody(id, body);
      }
      await approveTwitterPost(id, adminEmail);
      await load();
    } catch (err) {
      console.error(err);
      setError('Approve failed.');
    } finally {
      setBusy(false);
    }
  };

  const onReject = async (id: string) => {
    setBusy(true);
    try {
      await rejectTwitterPost(id);
      await load();
    } catch (err) {
      console.error(err);
      setError('Reject failed.');
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const body = bodyDrafts[id];
      if (body && body !== posts.find((p) => p.id === id)?.body) {
        await updateTwitterPostBody(id, body);
      }
      const result = await twitterPublishNow(id);
      if (!result.ok) {
        setError(result.error ?? 'Publish failed');
        await load();
        return;
      }
      await load();
    } catch (err) {
      console.error(err);
      setError('Publish failed — check X API keys on Railway.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-secondary text-sm py-12 justify-center">
        <Loader2 className="animate-spin" size={16} />
        Loading X / Twitter…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary">X / Twitter</h2>
          <p className="text-secondary text-sm mt-1 max-w-2xl">
            AI stats drafts on a schedule, plus an optional daily random win flyer (PNG + caption).
            Cron runs on bot-service (~1 min). Requires Railway X API keys + BOT_ADMIN_SECRET.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/[0.04] hover:bg-black/[0.06] text-primary text-sm"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-amber-500 text-sm border border-amber-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-card-dark rounded-xl border border-border p-4">
          <p className="text-secondary text-xs uppercase tracking-wide">Auto-post</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-primary text-sm font-medium">
              {settings?.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(settings?.enabled)}
              disabled={busy || !settings}
              onClick={() => void onToggle('enabled', !settings?.enabled)}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                settings?.enabled ? 'bg-emerald-500' : 'bg-black/20'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
                  settings?.enabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </div>

        <div className="bg-card-dark rounded-xl border border-border p-4">
          <p className="text-secondary text-xs uppercase tracking-wide">Admin approval</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-primary text-sm font-medium">
              {settings?.require_approval ? 'Required' : 'Optional (auto)'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(settings?.require_approval)}
              disabled={busy || !settings}
              onClick={() => void onToggle('require_approval', !settings?.require_approval)}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                settings?.require_approval ? 'bg-sky-500' : 'bg-black/20'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
                  settings?.require_approval ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </div>

        <div className="bg-card-dark rounded-xl border border-border p-4">
          <p className="text-secondary text-xs uppercase tracking-wide">X API</p>
          <p className="mt-3 text-primary text-sm font-medium">
            {credsOk === null
              ? 'Secret / bot unreachable'
              : credsOk
                ? 'Credentials on Railway'
                : 'Not configured'}
          </p>
          <p className="text-secondary text-xs mt-1">
            {pendingCount} draft{pendingCount === 1 ? '' : 's'} waiting
          </p>
        </div>
      </div>

      <div className="bg-card-dark rounded-xl border border-border p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-primary">Win flyer posts</h3>
            <p className="text-secondary text-xs mt-1 max-w-xl">
              At each schedule hour (e.g. 10 &amp; 18 UTC): pick a flyer from the trade-flyers
              bucket (top picks first), post with 🔥 caption + site link. If the bucket is empty,
              fall back to a fresh render from recent wins. Needs Auto-post enabled.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(settings?.win_flyer_enabled)}
            disabled={busy || !settings}
            onClick={() => void onToggle('win_flyer_enabled', !settings?.win_flyer_enabled)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              settings?.win_flyer_enabled ? 'bg-emerald-500' : 'bg-black/20'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
                settings?.win_flyer_enabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <p className="text-xs text-secondary flex-1 min-w-[200px]">
            Uses the same UTC hours as Schedule below. When flyer posts are on, they replace the
            AI stats draft at those hours.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onGenerate('win_flyer')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-primary text-sm"
          >
            <Sparkles size={14} />
            Generate win flyer now
          </button>
        </div>
        <div className="rounded-lg border border-border bg-black/[0.03] px-3 py-3 text-xs text-secondary space-y-2">
          <p className="font-medium text-primary text-sm">Flyer caption template</p>
          <pre className="whitespace-pre-wrap font-mono text-[11px] text-primary leading-relaxed">{`🔥 HyperGain win
{trader · }{COIN} {LONG|SHORT} +$12.40
app.hypergain.io
@HyperGainAi
#HyperGain #Hyperliquid #Perps`}</pre>
          <p>
            Tags: <span className="text-primary">#HyperGain</span> ·{' '}
            <span className="text-primary">#Hyperliquid</span> ·{' '}
            <span className="text-primary">#Perps</span> — kurz halten, kein Spam. Jeder Draft unten
            zeigt den finalen Kommentar vor Approve/Publish.
          </p>
        </div>
      </div>

      <div className="bg-card-dark rounded-xl border border-border p-4 space-y-4">
        <h3 className="text-sm font-semibold text-primary">Schedule (UTC)</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs text-secondary">
            Hours (comma-separated)
            <input
              value={hoursDraft}
              onChange={(e) => setHoursDraft(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-transparent text-primary text-sm min-w-[180px]"
              placeholder="10, 18"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-secondary">
            Site URL
            <input
              value={settings?.site_url ?? ''}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, site_url: e.target.value } : s))
              }
              onBlur={() => {
                if (settings?.site_url != null) {
                  void saveSettings({ site_url: settings.site_url });
                }
              }}
              className="px-3 py-2 rounded-lg border border-border bg-transparent text-primary text-sm min-w-[220px]"
              placeholder="https://hypergain.io"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-secondary">
            Handle (display)
            <input
              value={settings?.brand_handle ?? ''}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, brand_handle: e.target.value } : s))
              }
              onBlur={() => {
                if (settings) {
                  void saveSettings({ brand_handle: settings.brand_handle });
                }
              }}
              className="px-3 py-2 rounded-lg border border-border bg-transparent text-primary text-sm min-w-[140px]"
              placeholder="@hypergain"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSaveSchedule()}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium"
          >
            Save schedule
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onGenerate('stats')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-primary text-sm"
          >
            <Sparkles size={14} />
            Generate stats draft
          </button>
        </div>
        <p className="text-secondary text-xs">
          Last generated:{' '}
          {settings?.last_generated_at
            ? new Date(settings.last_generated_at).toLocaleString()
            : '—'}{' '}
          · Last posted:{' '}
          {settings?.last_posted_at
            ? new Date(settings.last_posted_at).toLocaleString()
            : '—'}
        </p>
      </div>

      <div className="bg-card-dark rounded-xl border border-border p-4 space-y-3">
        <h3 className="text-sm font-semibold text-primary">Tweet template</h3>
        <p className="text-secondary text-xs">
          Exact text with placeholders. When saved, drafts use this (no free AI rewrite). Leave empty
          after clear to fall back to AI/default.
        </p>
        <textarea
          value={templateDraft}
          onChange={(e) => setTemplateDraft(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-primary text-sm font-mono resize-y"
          placeholder={DEFAULT_TWEET_TEMPLATE}
        />
        <p className="text-secondary text-xs">
          Placeholders:{' '}
          <code className="text-primary">{TWEET_TEMPLATE_PLACEHOLDERS}</code>
        </p>
        <p className="text-secondary text-xs">
          <code className="text-primary">{'{{hypurrscan}}'}</code> is filled only for the top
          profitable 24h close when that row has a matching wallet (or exit tx). Otherwise it is
          omitted — never a guessed link.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSaveTemplate()}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium"
          >
            Save template
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setTemplateDraft(DEFAULT_TWEET_TEMPLATE)}
            className="px-4 py-2 rounded-lg border border-border text-primary text-sm"
          >
            Reset example
          </button>
        </div>
      </div>

      <div className="bg-card-dark rounded-xl border border-border p-4 space-y-3">
        <h3 className="text-sm font-semibold text-primary">Admin secret</h3>
        <p className="text-secondary text-xs">
          Same value as Railway <code className="text-primary">BOT_ADMIN_SECRET</code>. Prefer
          Vercel env <code className="text-primary">VITE_BOT_ADMIN_SECRET</code>; or paste here for
          this browser session.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-xs text-secondary flex-1 min-w-[220px]">
            BOT_ADMIN_SECRET
            <input
              type="password"
              autoComplete="off"
              value={adminSecretDraft}
              onChange={(e) => setAdminSecretDraft(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-transparent text-primary text-sm"
              placeholder="paste Railway secret"
            />
          </label>
          <button
            type="button"
            onClick={onSaveAdminSecret}
            className="px-4 py-2 rounded-lg border border-border text-primary text-sm"
          >
            Save for session
          </button>
        </div>
        <div className="text-secondary text-xs space-y-1 border-t border-border pt-3">
          <p className="font-medium text-primary">Railway env (bot-service)</p>
          <code className="block">X_API_KEY · X_API_SECRET · X_ACCESS_TOKEN · X_ACCESS_TOKEN_SECRET</code>
          <code className="block">BOT_ADMIN_SECRET · OPENAI_API_KEY (optional if template set)</code>
        </div>
      </div>

      <div className="bg-card-dark rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-primary">Recent posts</h3>
          <span className="text-secondary text-xs">{posts.length} rows</span>
        </div>
        {posts.length === 0 ? (
          <p className="text-secondary text-sm p-6 text-center">
            No drafts yet — click Generate or enable auto-post and wait for the next UTC hour.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {posts.map((post) => {
              const editable = ['draft', 'approved', 'scheduled', 'failed'].includes(post.status);
              const draft = bodyDrafts[post.id] ?? post.body;
              return (
                <li key={post.id} className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <StatusPill status={post.status} />
                      <span className="text-secondary text-xs">
                        {new Date(post.created_at).toLocaleString()} · {post.source}
                        {post.slot_key ? ` · ${post.slot_key}` : ''}
                      </span>
                    </div>
                    {post.twitter_id && (
                      <a
                        href={`https://x.com/i/status/${post.twitter_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
                      >
                        View on X <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  {editable ? (
                    <textarea
                      value={draft}
                      onChange={(e) =>
                        setBodyDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                      }
                      rows={3}
                      maxLength={280}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-transparent text-primary text-sm resize-y"
                    />
                  ) : (
                    <p className="text-primary text-sm whitespace-pre-wrap">{post.body}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <span className="text-secondary text-xs">{draft.length}/280</span>
                    <div className="flex flex-wrap gap-2">
                      {post.status === 'draft' && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onApprove(post.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-400 text-xs font-medium"
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onReject(post.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-black/10 text-secondary text-xs font-medium"
                          >
                            <XIcon size={12} /> Reject
                          </button>
                        </>
                      )}
                      {['draft', 'approved', 'scheduled', 'failed'].includes(post.status) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onPublish(post.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white text-black text-xs font-medium"
                        >
                          <Send size={12} /> Post now
                        </button>
                      )}
                    </div>
                  </div>
                  {post.error && (
                    <p className="text-red-400 text-xs">{post.error}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminTwitterSocial;
