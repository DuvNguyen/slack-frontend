'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiCall } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

interface InvitationInfo {
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
}

interface InvitationResponse {
  ok: boolean;
  message?: string;
  invitation?: InvitationInfo;
}

interface AcceptResponse {
  ok: boolean;
  message?: string;
  workspace_id?: string;
}

interface MeResponse {
  user?: {
    id: string;
    name?: string | null;
    display_name?: string | null;
  };
}

function InviteAcceptClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const isTokenMissing = !token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push('/auth?mode=signin');
      return;
    }
    if (!token) {
      return;
    }

    async function load() {
      try {
        const res = await apiCall<InvitationResponse>(`/api/ws/invitations/public/${token}`, { method: 'GET' }, true);
        if (!res.ok) throw new Error(res.message || 'Failed to load invitation');
        if (res.invitation) {
          setInvitation(res.invitation);
        }

        const meRes = await apiCall<MeResponse>('/api/identity/secure/users/me', { method: 'GET' }, true);
        if (meRes.user) {
          setName(meRes.user.display_name || meRes.user.name || '');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Invitation not found or expired.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [token, router]);

  async function handleAccept() {
    setSaving(true);
    try {
      if (name.trim()) {
        await apiCall('/api/chat/profile/me', {
          method: 'PATCH',
          body: JSON.stringify({ display_name: name.trim() }),
        }, true);
      }

      const res = await apiCall<AcceptResponse>(`/api/ws/invitations/accept/${token}`, {
        method: 'POST',
      }, true);

      if (!res.ok) throw new Error(res.message || 'Failed to accept invitation');

      if (res.workspace_id) {
        router.push(`/chat?workspaceId=${res.workspace_id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  if (isTokenMissing) {
    return (
      <div className="grid h-screen place-items-center bg-[#F7F4EE]">
        <div className="text-center">
          <p className="mb-4 text-[#B3261E]">Invalid invitation link.</p>
          <button onClick={() => router.push('/')} className="text-blue-600 underline">Go home</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="grid h-screen place-items-center bg-[#F7F4EE]">Loading...</div>;
  }

  if (error) {
    return (
      <div className="grid h-screen place-items-center bg-[#F7F4EE]">
        <div className="text-center">
          <p className="mb-4 text-[#B3261E]">{error}</p>
          <button onClick={() => router.push('/')} className="text-blue-600 underline">Go home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#F7F4EE] px-4 font-sans text-[#1A1A1A]">
      <div className="w-full max-w-lg bg-white p-8 md:p-12 shadow-sm border border-[#ddd]">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Join {invitation?.workspace_name} on Slack</h1>
          <p className="text-[#666]">Slack is where work happens for companies of all sizes.</p>
        </div>

        <div className="mb-8 flex flex-col items-center justify-center text-center">
           <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-[#eee] text-xl font-bold text-[#555]">
             {invitation?.email?.[0].toUpperCase()}
           </div>
           <p className="text-sm text-[#444]"><strong>{invitation?.email}</strong> has been invited to join.</p>
        </div>

        <div className="border-t border-[#eee] pt-8">
          <p className="mb-6 text-center text-sm font-semibold">You&apos;re accepting an invitation.</p>
          
          <label className="mb-1 block text-sm font-semibold">Your name</label>
          <input 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-6 w-full rounded border border-[#6B6B6B] px-3 py-3" 
            placeholder="What should we call you?"
          />

          <button 
            disabled={saving || !name.trim()}
            onClick={() => void handleAccept()}
            className="w-full rounded bg-[#4A154B] px-4 py-3 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Joining...' : 'Continue'}
          </button>
          
          <p className="mt-4 text-center text-xs text-[#666]">
            By continuing, you&apos;re agreeing to Slack&apos;s User Terms of Service.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={<div className="grid h-screen place-items-center bg-[#F7F4EE]">Loading...</div>}>
      <InviteAcceptClient />
    </Suspense>
  );
}
