'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { saveTokens } from '@/lib/auth';

function GoogleAuthCallbackClient() {
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    const accessToken = search.get('access_token') ?? '';
    const refreshToken = search.get('refresh_token') ?? '';
    const next = search.get('next') ?? '/workspaces';
    const inviteToken = search.get('invite_token') ?? '';

    if (!accessToken || !refreshToken) {
      router.replace('/auth?mode=signin');
      return;
    }

    saveTokens(accessToken, refreshToken);

    if (inviteToken) {
      router.replace(`/invite/accept?token=${encodeURIComponent(inviteToken)}`);
      return;
    }

    router.replace(next.startsWith('/') ? next : '/workspaces');
  }, [router, search]);

  return <div className="grid min-h-screen place-items-center text-sm text-[#1A1A1A]">Signing you in with Google...</div>;
}

export default function GoogleAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-[#1A1A1A]">Signing you in with Google...</div>}>
      <GoogleAuthCallbackClient />
    </Suspense>
  );
}
