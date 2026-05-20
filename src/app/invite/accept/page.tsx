'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiCall } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

type InvitationInfo = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expires_at: string;
};

export default function AcceptInvitePage() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get('token') ?? '';

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);

  useEffect(() => {
    async function loadInfo() {
      if (!token) {
        setError('Missing invitation token');
        setLoading(false);
        return;
      }

      try {
        const res = await apiCall<{ ok: boolean; invitation: InvitationInfo }>(`/api/ws/invitations/public/${encodeURIComponent(token)}`);
        setInvitation(res.invitation);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Invalid invitation');
      } finally {
        setLoading(false);
      }
    }

    void loadInfo();
  }, [token]);

  async function accept() {
    if (!token) return;

    if (!getAccessToken()) {
      router.push(`/auth?mode=signin&next=/invite/accept&invite_token=${encodeURIComponent(token)}`);
      return;
    }

    setAccepting(true);
    setError('');
    try {
      const res = await apiCall<{ ok: boolean; workspace_id: string }>(`/api/ws/invitations/accept/${encodeURIComponent(token)}`, { method: 'POST' }, true);
      router.push(`/chat?workspaceId=${res.workspace_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Cannot accept invitation');
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-[#1A1A1A]">Loading invitation...</div>;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#F6F3EC] px-4 py-10 text-[#1A1A1A]">
      <section className="w-full max-w-xl border border-[#D3CCBB] bg-white p-6">
        <h1 className="text-3xl font-bold">Join workspace invitation</h1>
        {invitation ? (
          <>
            <p className="mt-3 text-sm">Workspace: <strong>{invitation.workspace_name}</strong></p>
            <p className="mt-1 text-sm">Invited email: <strong>{invitation.email}</strong></p>
            <p className="mt-1 text-sm">Role: <strong>{invitation.role}</strong></p>
            <p className="mt-1 text-sm">Status: <strong>{invitation.status}</strong></p>
          </>
        ) : null}

        {error ? <p className="mt-4 text-sm text-[#B3261E]">{error}</p> : null}

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => void accept()}
            disabled={accepting || !invitation || invitation.status !== 'PENDING'}
            className="border border-[#6B6B6B] bg-[#C8D65A] px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {accepting ? 'Accepting...' : 'Accept invitation'}
          </button>
          <button onClick={() => router.push('/auth?mode=signin')} className="border border-[#6B6B6B] px-4 py-2 text-sm">Sign in</button>
        </div>
      </section>
    </main>
  );
}
