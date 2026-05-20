'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiCall } from '@/lib/api';
import { clearTokens, getAccessToken } from '@/lib/auth';
import { PublicLayout } from '@/components/public-layout';
import { ModalShell } from '@/components/modal-shell';

type Workspace = { id: string; name: string; owner_id: string; my_role?: 'OWNER' | 'ADMIN' | 'MEMBER' };
type MeResponse = { ok: boolean; user: { name?: string | null; username?: string | null } };

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

  const inviteUsernames = useMemo(
    () => Array.from(new Set(inviteInput.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean))),
    [inviteInput],
  );

  async function load() {
    try {
      const [mine, me] = await Promise.all([
        apiCall<{ ok: boolean; workspaces: Workspace[] }>('/api/ws/workspaces/mine', { method: 'GET' }, true),
        apiCall<MeResponse>('/api/identity/secure/users/me', { method: 'GET' }, true),
      ]);
      setWorkspaces(mine.workspaces ?? []);
      setProfileName(me.user?.name ?? '');
      setWorkspaceName('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

    useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/auth?mode=signin');
      return;
    }
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [router]);

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

  function logout() {
    clearTokens();
    router.push('/auth?mode=signin');
  }

  if (step > 0) {
    return (
      <PublicLayout right={<button onClick={logout} className="border border-[#6B6B6B] px-3 py-2 text-sm hover:bg-[#F0EDE6]">Sign out</button>}>
        <div className="mx-auto grid w-full max-w-6xl place-items-center">
        <section className="w-full max-w-4xl rounded-2xl bg-white p-8 md:p-10 relative">
          <div className="mb-8 flex gap-2">
            {[1, 2, 3].map((s) => (
              <span key={s} className={`h-1.5 w-7 rounded-full ${s <= step ? 'bg-[#611f69]' : 'bg-[#e8d9eb]'}`} />
            ))}
          </div>

          {step === 1 && (
            <>
              <h1 className="text-4xl font-bold">Name your workspace</h1>
              <p className="mt-2 text-lg text-[#555]">Choose a name your team can recognize.</p>
              <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} className="mt-8 w-full max-w-md rounded-lg border px-4 py-3" placeholder="ex: Acme Inc." />
              <div className="mt-8"><button disabled={!workspaceName.trim()} onClick={() => setStep(2)} className="rounded-md bg-[#611f69] px-6 py-3 text-white disabled:opacity-50">Next</button></div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-4xl font-bold">What&apos;s your name?</h1>
              <p className="mt-2 text-lg text-[#555]">Your teammates will recognize you easier.</p>
              <input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="mt-8 w-full max-w-md rounded-lg border px-4 py-3" placeholder="Your full name" />
              <div className="mt-8 flex gap-3">
                <button onClick={() => setStep(1)} className="rounded-md border px-6 py-3">Back</button>
                <button disabled={!profileName.trim()} onClick={() => setStep(3)} className="rounded-md bg-[#611f69] px-6 py-3 text-white disabled:opacity-50">Next</button>
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
                <button disabled={saving} onClick={() => finish(false)} className="rounded-md bg-[#611f69] px-6 py-3 text-white disabled:opacity-50">{saving ? 'Finishing...' : 'Finish setup'}</button>
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
                <button disabled={saving} onClick={() => finish(true)} className="rounded-md bg-[#e01e5a] px-4 py-2 text-white">Don&apos;t Invite Anyone</button>
              </div>
            </ModalShell>
          ) : null}

          {error ? <p className="mt-4 text-[#b3261e]">{error}</p> : null}
        </section>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout right={<button onClick={logout} className="border border-[#6B6B6B] px-3 py-2 text-sm hover:bg-[#F0EDE6]">Sign out</button>}>
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-10 flex items-center justify-between">
          <h1 className="text-5xl font-bold">Workspaces</h1>
        </div>

        <button onClick={() => setStep(1)} className="mb-8 w-full rounded-xl bg-[#611f69] px-6 py-5 text-left text-white">
          <p className="text-3xl font-semibold">Create workspace</p>
          <p className="mt-1 text-sm text-white/80">Click here to create a new workspace.</p>
        </button>

        {loading ? <p>Loading...</p> : (
          <div className="grid gap-3">
            {workspaces.map((ws) => (
              <button key={ws.id} onClick={() => router.push(`/chat?workspaceId=${ws.id}`)} className="rounded-lg border bg-white px-4 py-3 text-left">
                <p className="font-semibold">{ws.name}</p>
                <p className="text-sm text-[#666]">Role: {ws.my_role ?? 'MEMBER'}</p>
              </button>
            ))}
          </div>
        )}
        {error ? <p className="mt-4 text-[#b3261e]">{error}</p> : null}
      </div>
    </PublicLayout>
  );
}