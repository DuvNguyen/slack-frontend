'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { apiCall } from '@/lib/api';
import { clearTokens, getAccessToken, getRefreshToken } from '@/lib/auth';
import { ModalShell } from '@/components/modal-shell';

type Workspace = { id: string; name: string; owner_id: string; my_role?: 'OWNER' | 'ADMIN' | 'MEMBER' };
type Me = { id: string; email: string; name?: string | null; username?: string | null; display_name?: string | null; avatar_url?: string | null; phone?: string | null; status_text?: string | null; };
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
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showEditContact, setShowEditContact] = useState(false);
  const [showEditStatus, setShowEditStatus] = useState(false);
  
  const [profileForm, setProfileForm] = useState({ fullName: '', displayName: '' });
  const [contactForm, setContactForm] = useState({ email: '', phone: '' });
  const [statusForm, setStatusForm] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  
  const editAvatarInputRef = useRef<HTMLInputElement | null>(null);

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
      setProfileForm({ fullName: meRes.user?.name ?? '', displayName: meRes.user?.display_name ?? '' });
      setContactForm({ email: meRes.user?.email ?? '', phone: meRes.user?.phone ?? '' });
      setStatusForm(meRes.user?.status_text ?? '');
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

  async function saveProfile() {
    setSavingProfile(true);
    try {
      if (avatarPreview && avatarPreview !== (me?.avatar_url ?? null)) {
        await apiCall('/api/chat/profile/me/avatar', {
          method: 'POST',
          body: JSON.stringify({ data_url: avatarPreview }),
        }, true);
      }
      await apiCall('/api/chat/profile/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profileForm.fullName,
          display_name: profileForm.displayName,
        }),
      }, true);
      await load();
      setShowEditProfile(false);
      setAvatarPreview(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save profile failed';
      window.alert(message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveContact() {
    setSavingProfile(true);
    try {
      await apiCall('/api/chat/profile/me', {
        method: 'PATCH',
        body: JSON.stringify({ phone: contactForm.phone }),
      }, true);
      await load();
      setShowEditContact(false);
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveStatus() {
    setSavingProfile(true);
    try {
      await apiCall('/api/chat/profile/me/status', {
        method: 'POST',
        body: JSON.stringify({ status_text: statusForm }),
      }, true);
      await load();
      setShowEditStatus(false);
    } finally {
      setSavingProfile(false);
    }
  }

  function onEditAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setAvatarPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  const pageBody = (
    <main className={`chat-shell h-screen w-full overflow-hidden ${darkMode ? 'app-dark' : ''}`}>
      <div className={`grid h-full w-full ${profilePanelOpen ? 'grid-cols-[64px_1fr_380px]' : 'grid-cols-[64px_1fr]'}`}>
        <aside className="relative flex flex-col items-center border-r border-[var(--chat-border)] bg-[var(--chat-rail)] py-4 text-[var(--chat-text)]">
          <button
            onClick={() => {
              setMenuOpen((v) => !v);
              setProfilePanelOpen(false);
            }}
            className="relative h-10 w-10 overflow-hidden rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)]"
          >
            {me?.avatar_url ? <Image src={me.avatar_url} alt="avatar" fill unoptimized className="h-full w-full object-cover" /> : <span className="text-sm font-bold">{(me?.display_name ?? me?.name ?? 'S').slice(0, 1).toUpperCase()}</span>}
          </button>

          {menuOpen ? (
            <div className="absolute left-16 top-4 z-40 w-44 border border-[var(--chat-border)] bg-[var(--chat-surface)] p-2 text-sm shadow-lg">
              <button onClick={() => { setProfilePanelOpen(true); setMenuOpen(false); }} className="block w-full px-2 py-2 text-left hover:bg-[var(--chat-hover)]">Profile</button>
              <button onClick={() => void logout()} className="block w-full px-2 py-2 text-left text-[#b3261e] hover:bg-[var(--chat-hover)]">Sign out</button>
            </div>
          ) : null}

        <button onClick={() => setDarkMode((v) => !v)} className="mt-auto h-10 w-10 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] text-xl">{darkMode ? '☀' : '☾'}</button>
      </aside>

      <div className="w-full bg-[var(--chat-main)] px-6 py-6 text-[var(--chat-text)] md:px-10 overflow-auto">
        {step > 0 ? (
          <div className="mx-auto grid w-full max-w-6xl place-items-center mt-10">
            <section className="w-full max-w-4xl rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-8 md:p-10 relative text-[var(--chat-text)]">
              <div className="mb-8 flex gap-2">
                {[1, 2, 3].map((s) => (
                  <span key={s} className={`h-1.5 w-7 rounded-full ${s <= step ? 'bg-[var(--tertiary)]' : 'bg-[var(--chat-border)]'}`} />
                ))}
              </div>

              {step === 1 && (
                <>
                  <h1 className="text-4xl font-bold">Name your workspace</h1>
                  <p className="mt-2 text-lg text-[#555]">Choose a name your team can recognize.</p>
                  <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} className="mt-8 w-full max-w-md rounded-lg border px-4 py-3" placeholder="ex: Acme Inc." />
                  <div className="mt-8"><button disabled={!workspaceName.trim()} onClick={() => setStep(2)} className="rounded-md bg-[var(--tertiary)] px-6 py-3 text-[var(--on-primary)] disabled:opacity-50 hover:opacity-90 transition-opacity">Next</button></div>
                </>
              )}

              {step === 2 && (
                <>
                  <h1 className="text-4xl font-bold">What&apos;s your name?</h1>
                  <p className="mt-2 text-lg text-[#555]">Your teammates will recognize you easier.</p>
                  <input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="mt-8 w-full max-w-md rounded-lg border px-4 py-3" placeholder="Your full name" />
                  <div className="mt-8 flex gap-3">
                    <button onClick={() => setStep(1)} className="rounded-md border border-[var(--chat-border)] px-6 py-3 hover:bg-[var(--chat-hover)] transition-colors">Back</button>
                    <button disabled={!profileName.trim()} onClick={() => setStep(3)} className="rounded-md bg-[var(--tertiary)] px-6 py-3 text-[var(--on-primary)] disabled:opacity-50 hover:opacity-90 transition-opacity">Next</button>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <h1 className="text-4xl font-bold">Invite your teammates</h1>
                  <p className="mt-2 text-lg text-[#555]">Nhập username đăng nhập, phân tách bằng dấu phẩy hoặc khoảng trắng.</p>
                  <textarea value={inviteInput} onChange={(e) => setInviteInput(e.target.value)} className="mt-8 h-36 w-full max-w-2xl rounded-lg border px-4 py-3" placeholder="alice, bob, charlie" />
                  <div className="mt-8 flex gap-3">
                    <button onClick={() => setStep(2)} className="rounded-md border border-[var(--chat-border)] px-6 py-3 hover:bg-[var(--chat-hover)] transition-colors">Back</button>
                    <button disabled={saving} onClick={() => void finish(false)} className="rounded-md bg-[var(--tertiary)] px-6 py-3 text-[var(--on-primary)] disabled:opacity-50 hover:opacity-90 transition-opacity">{saving ? 'Finishing...' : 'Finish setup'}</button>
                    <button disabled={saving} onClick={() => setShowSkipModal(true)} className="rounded-md border border-[var(--chat-border)] px-6 py-3 hover:bg-[var(--chat-hover)] transition-colors">Skip for now</button>
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
                    <button onClick={() => setShowSkipModal(false)} className="rounded-md border border-[var(--chat-border)] px-4 py-2 hover:bg-[var(--chat-hover)] transition-colors">Back</button>
                    <button disabled={saving} onClick={() => void finish(true)} className="rounded-md border border-[var(--chat-border)] bg-[var(--tertiary)] px-4 py-2 text-[var(--on-primary)] hover:opacity-90 transition-opacity">Don&apos;t Invite Anyone</button>
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

            <button onClick={() => setStep(1)} className="mb-8 w-full rounded-xl bg-[var(--tertiary)] px-6 py-5 text-left text-[var(--on-primary)] hover:opacity-90 transition-opacity">
              <p className="text-3xl font-semibold">Create workspace</p>
              <p className="mt-1 text-sm opacity-80">Click here to create a new workspace.</p>
            </button>

            {loading ? <p>Loading...</p> : (
              <div className="mt-8">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--chat-muted)]">Created workspaces</h2>
                <div className="grid gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4">
                  {workspaces.length === 0 ? <p className="text-sm text-[var(--chat-muted)]">No workspaces found.</p> : null}
                  {workspaces.map((ws) => (
                    <button key={ws.id} onClick={() => router.push(`/chat?workspaceId=${ws.id}`)} className="rounded-lg border border-[var(--chat-border)] bg-[var(--chat-main)] px-4 py-3 text-left hover:bg-[var(--chat-hover)] transition-colors">
                      <p className="font-semibold">{ws.name}</p>
                      <p className="text-sm text-[var(--chat-muted)]">Role: {ws.my_role ?? 'MEMBER'}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {error ? <p className="mt-4 text-[#b3261e]">{error}</p> : null}
          </div>
        )}
      </div>

      {profilePanelOpen && me ? (
        <aside className="border-l border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text)] p-4 overflow-auto">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-3xl font-bold">Profile</h3>
            <button onClick={() => setProfilePanelOpen(false)} className="text-2xl hover:opacity-70">×</button>
          </div>

          <div className="overflow-hidden border border-[var(--chat-border)] bg-[var(--chat-main)]">
            <div className="relative mx-auto mt-4 h-56 w-56 overflow-hidden rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)]">
              {me.avatar_url ? <Image src={me.avatar_url} alt="avatar" fill unoptimized className="h-full w-full object-cover" /> : null}
            </div>
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-4xl font-bold">{me.display_name ?? me.name ?? me.username}</p>
                <button onClick={() => { setShowEditProfile(true); setAvatarPreview(null); }} className="text-sm font-semibold underline hover:opacity-70">Edit</button>
              </div>
              <p className="text-sm text-[var(--chat-muted)]">@{me.username ?? 'unknown'}</p>
              <p className="mt-3 text-sm">{me.status_text || 'No status set'}</p>
              <div className="mt-4 grid gap-2">
                <button onClick={() => setShowEditStatus(true)} className="border border-[var(--chat-border)] px-3 py-2 text-left hover:bg-[var(--chat-hover)]">Edit status</button>
                <button onClick={() => setShowEditContact(true)} className="border border-[var(--chat-border)] px-3 py-2 text-left hover:bg-[var(--chat-hover)]">Edit contact information</button>
              </div>
              <div className="mt-6 border-t border-[var(--chat-border)] pt-4 text-sm text-[var(--chat-muted)]">
                <p>{me.email ?? 'No email'}</p>
                <p className="mt-1">{me.phone ?? 'No phone'}</p>
              </div>
            </div>
          </div>
        </aside>
      ) : null}
      </div>

      {showEditProfile ? (
        <ModalShell title={<h2 className="text-3xl font-bold">Edit your profile</h2>} onClose={() => { setShowEditProfile(false); setAvatarPreview(null); }} className="max-w-4xl">
          <div className="grid gap-6 md:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-[var(--chat-muted)]">Full name</label>
                <input value={profileForm.fullName} onChange={(e) => setProfileForm((p) => ({ ...p, fullName: e.target.value }))} className="w-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-[var(--chat-text)]" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[var(--chat-muted)]">Display name</label>
                <input value={profileForm.displayName} onChange={(e) => setProfileForm((p) => ({ ...p, displayName: e.target.value }))} className="w-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-[var(--chat-text)]" />
              </div>
              <div className="pt-2">
                <button disabled={savingProfile} onClick={() => void saveProfile()} className="border border-[var(--chat-border)] bg-[var(--chat-hover)] px-4 py-2 text-[var(--chat-text)] hover:opacity-90">Save changes</button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm text-[var(--chat-muted)]">Profile photo</p>
              <div className="relative h-56 w-56 overflow-hidden border border-[var(--chat-border)] bg-[var(--chat-main)]">
                {(avatarPreview || me?.avatar_url) ? <Image src={avatarPreview ?? me?.avatar_url ?? ''} alt="avatar" fill unoptimized className="h-full w-full object-cover" /> : null}
              </div>
              <button onClick={() => editAvatarInputRef.current?.click()} className="mt-3 border border-[var(--chat-border)] px-4 py-2 hover:bg-[var(--chat-hover)]">Upload photo</button>
              <input ref={editAvatarInputRef} type="file" accept="image/*" className="hidden" onChange={onEditAvatarPick} />
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showEditContact ? (
        <ModalShell title={<h2 className="text-3xl font-bold">Edit Contact information</h2>} onClose={() => setShowEditContact(false)} className="max-w-2xl">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-[var(--chat-muted)]">Email Address</label>
              <input value={contactForm.email} disabled className="w-full border border-[var(--chat-border)] bg-[var(--chat-main)] px-3 py-2 text-[var(--chat-muted)]" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[var(--chat-muted)]">Phone</label>
              <input value={contactForm.phone} onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))} className="w-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-[var(--chat-text)]" placeholder="Add phone" />
            </div>
            <div className="pt-2">
              <button disabled={savingProfile} onClick={() => void saveContact()} className="border border-[var(--chat-border)] bg-[var(--chat-hover)] px-4 py-2 text-[var(--chat-text)] hover:opacity-90">Save changes</button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showEditStatus ? (
        <ModalShell title={<h2 className="text-3xl font-bold">Edit status</h2>} onClose={() => setShowEditStatus(false)} className="max-w-2xl">
          <div className="space-y-4">
            <label className="block text-sm text-[var(--chat-muted)]">Status</label>
            <input value={statusForm} onChange={(e) => setStatusForm(e.target.value)} className="w-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-[var(--chat-text)]" placeholder="Set a status" />
            <button disabled={savingProfile} onClick={() => void saveStatus()} className="border border-[var(--chat-border)] bg-[var(--chat-hover)] px-4 py-2 text-[var(--chat-text)] hover:opacity-90">Save changes</button>
          </div>
        </ModalShell>
      ) : null}
    </main>
  );

  return pageBody;
}
