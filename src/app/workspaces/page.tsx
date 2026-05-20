'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiCall } from '@/lib/api';
import { clearTokens, getAccessToken, getRefreshToken } from '@/lib/auth';
import { PublicLayout } from '@/components/public-layout';
import { ModalShell } from '@/components/modal-shell';

type Workspace = { id: string; name: string; owner_id: string; my_role?: 'OWNER' | 'ADMIN' | 'MEMBER' };
type Me = { id: string; email: string; name?: string | null; username?: string | null; display_name?: string | null; avatar_url?: string | null };
type MeResponse = { ok: boolean; user: Me };

const THEME_KEY = 'slack_mvp_chat_theme';

export default function WorkspaceSelectorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState('');

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [saving, setSaving] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);

  const [workspaceName, setWorkspaceName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [inviteInput, setInviteInput] = useState('');

  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => (typeof window !== 'undefined' && localStorage.getItem(THEME_KEY) === 'dark'));

  const inviteUsernames = useMemo(
    () => Array.from(new Set(inviteInput.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean))),
    [inviteInput],
  );

  async function load() {
    try {
      const [mine, meRes] = await Promise.all([
        apiCall<{ ok: boolean; workspaces: Workspace[] }>('/api/ws/workspaces/mine', { method: 'GET' }, true),
        apiCall<MeResponse>('/api/chat/profile/me', { method: 'GET' }, true),
      ]);
      setWorkspaces(mine.workspaces ?? []);
      setMe(meRes.user ?? null);
      setProfileName(meRes.user?.name ?? '');
      setWorkspaceName('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/auth?mode=signin');
      return;
    }
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);  }, [router]);

  async function finish(skipInvite: boolean) {
    setSaving(true);
    setError('');
    try {
      const created = await apiCall<{ ok: boolean; workspace: Workspace }>('/api/ws/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: workspaceName.trim() || 'My Workspace' }),
      }, true);

      await apiCall('/api/identity/secure/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: profileName.trim() || null }),
      }, true);

      if (!skipInvite && inviteUsernames.length > 0) {
        await apiCall(`/api/ws/workspaces/${created.workspace.id}/invite-usernames`, {
          method: 'POST',
          body: JSON.stringify({ usernames: inviteUsernames }),
        }, true);
      }

      router.push(`/chat?workspaceId=${created.workspace.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setSaving(false);
      setShowSkipModal(false);
    }
  }

  async function logout() {
    try {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        await apiCall('/api/identity/secure/auth/signout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        }, true);
      }
    } catch {
      // noop
    } finally {
      clearTokens();
      router.push('/auth?mode=signin');
    }
  }

  const pageBody = (
    <div className={`chat-shell grid min-h-[72vh] w-full grid-cols-[64px_1fr] overflow-hidden border border-[var(--chat-border)] ${darkMode ? 'app-dark' : ''}`}>
      <aside className="relative flex flex-col items-center border-r border-[var(--chat-border)] bg-[var(--chat-rail)] py-4 text-[var(--chat-text)]">
        <button onClick={() => setMenuOpen((v) => !v)} className="h-10 w-10 overflow-hidden rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)]">
          {me?.avatar_url ? <img src={me.avatar_url} alt="avatar" className="h-full w-full object-cover" /> : <span className="text-sm font-bold">{(me?.display_name ?? me?.name ?? 'S').slice(0, 1).toUpperCase()}</span>}
        </button>

        {menuOpen ? (
          <div className="absolute left-16 top-4 z-30 w-44 border border-[var(--chat-border)] bg-[var(--chat-surface)] p-2 text-sm">
            <button onClick={() => void logout()} className="block w-full px-2 py-2 text-left text-[#b3261e] hover:bg-[var(--chat-hover)]">Sign out</button>
          </div>
        ) : null}

        <button onClick={() => setDarkMode((v) => !v)} className="mt-auto h-10 w-10 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-xl">{darkMode ? '☀' : '☾'}</button>
      </aside>

      <div className="w-full bg-[var(--chat-main)] px-6 py-6 text-[var(--chat-text)] md:px-10">
        {step > 0 ? (
          <div className="mx-auto grid w-full max-w-6xl place-items-center">
            <section className="w-full max-w-4xl rounded-2xl bg-white p-8 md:p-10 relative text-[#1A1A1A]">
              <div className="mb-8 flex gap-2">
                {[1, 2, 3].map((s) => (
                  <span key={s} className={`h-1.5 w-7 rounded-full ${s <= step ? 'bg-[#C8D65A]' : 'bg-[#E6E0D2]'}`} />
                ))}
              </div>

              {step === 1 && (
                <>
                  <h1 className="text-4xl font-bold">Name your workspace</h1>
                  <p className="mt-2 text-lg text-[#555]">Choose a name your team can recognize.</p>
                  <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} className="mt-8 w-full max-w-md rounded-lg border px-4 py-3" placeholder="ex: Acme Inc." />
                  <div className="mt-8"><button disabled={!workspaceName.trim()} onClick={() => setStep(2)} className="rounded-md bg-[#C8D65A] px-6 py-3 text-[#1A1A1A] disabled:opacity-50">Next</button></div>
                </>
              )}

              {step === 2 && (
                <>
                  <h1 className="text-4xl font-bold">What&apos;s your name?</h1>
                  <p className="mt-2 text-lg text-[#555]">Your teammates will recognize you easier.</p>
                  <input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="mt-8 w-full max-w-md rounded-lg border px-4 py-3" placeholder="Your full name" />
                  <div className="mt-8 flex gap-3">
                    <button onClick={() => setStep(1)} className="rounded-md border px-6 py-3">Back</button>
                    <button disabled={!profileName.trim()} onClick={() => setStep(3)} className="rounded-md bg-[#C8D65A] px-6 py-3 text-[#1A1A1A] disabled:opacity-50">Next</button>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <h1 className="text-4xl font-bold">Invite your teammates</h1>
                  <p className="mt-2 text-lg text-[#555]">Nhập username đăng nhập, phân tách bằng dấu phẩy hoặc khoảng trắng.</p>
                  <textarea value={inviteInput} onChange={(e) => setInviteInput(e.target.value)} className="mt-8 h-36 w-full max-w-2xl rounded-lg border px-4 py-3" placeholder="alice, bob, charlie" />
                  <div className="mt-8 flex gap-3">
                    <button onClick={() => setStep(2)} className="rounded-md border px-6 py-3">Back</button>
                    <button disabled={saving} onClick={() => void finish(false)} className="rounded-md bg-[#C8D65A] px-6 py-3 text-[#1A1A1A] disabled:opacity-50">{saving ? 'Finishing...' : 'Finish setup'}</button>
                    <button disabled={saving} onClick={() => setShowSkipModal(true)} className="rounded-md border px-6 py-3">Skip for now</button>
                  </div>
                </>
              )}

              {showSkipModal ? (
                <ModalShell
                  title={<h2 className="text-3xl font-semibold">Skip without inviting?</h2>}
                  onClose={() => setShowSkipModal(false)}
                  className="max-w-md"
                  bodyClassName="h-[260px]"
                >
                  <p className="text-[#444]">Bạn có thể mời thêm sau ở màn hình chính từ sidebar.</p>
                  <div className="mt-6 flex justify-end gap-3">
                    <button onClick={() => setShowSkipModal(false)} className="rounded-md border px-4 py-2">Back</button>
                    <button disabled={saving} onClick={() => void finish(true)} className="rounded-md border border-[#6B6B6B] bg-[#C8D65A] px-4 py-2 text-[#1A1A1A]">Don&apos;t Invite Anyone</button>
                  </div>
                </ModalShell>
              ) : null}

              {error ? <p className="mt-4 text-[#b3261e]">{error}</p> : null}
            </section>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-5xl">
            <div className="mb-10 flex items-center justify-between">
              <h1 className="text-5xl font-bold">Workspaces</h1>
            </div>

            <button onClick={() => setStep(1)} className="mb-8 w-full rounded-xl bg-[#C8D65A] px-6 py-5 text-left text-[#1A1A1A]">
              <p className="text-3xl font-semibold">Create workspace</p>
              <p className="mt-1 text-sm text-[#1A1A1A]/80">Click here to create a new workspace.</p>
            </button>

            {loading ? <p>Loading...</p> : (
              <div className="grid gap-3">
                {workspaces.map((ws) => (
                  <button key={ws.id} onClick={() => router.push(`/chat?workspaceId=${ws.id}`)} className="rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] px-4 py-3 text-left">
                    <p className="font-semibold">{ws.name}</p>
                    <p className="text-sm text-[var(--chat-muted)]">Role: {ws.my_role ?? 'MEMBER'}</p>
                  </button>
                ))}
              </div>
            )}
            {error ? <p className="mt-4 text-[#b3261e]">{error}</p> : null}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <PublicLayout
      right={
        <button onClick={() => void logout()} className="border border-[#6B6B6B] px-3 py-2 text-sm hover:bg-[#F0EDE6]">
          Sign out
        </button>
      }
    >
      {pageBody}
    </PublicLayout>
  );
}
