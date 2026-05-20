'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiCall } from '@/lib/api';
import { saveTokens } from '@/lib/auth';
import { Button, Card, Input, Label } from '@/components/ui';
import { PublicLayout } from '@/components/public-layout';

type AuthResponse = {
  ok: boolean;
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string; username?: string; name?: string };
};

function AuthClientPage() {
  const router = useRouter();
  const search = useSearchParams();
  const mode = useMemo(() => (search.get('mode') === 'signup' ? 'signup' : 'signin'), [search]);

  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('123456');
  const [name, setName] = useState('Demo User');
  const [username, setUsername] = useState('demo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function continueWithGoogle() {
    const next = search.get('next') ?? '/workspaces';
    const inviteToken = search.get('invite_token') ?? '';
    const params = new URLSearchParams({ next });
    if (inviteToken) params.set('invite_token', inviteToken);
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
    window.location.href = `${apiBase}/api/identity/public/google/start?${params.toString()}`;
  }

  async function submit() {
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await apiCall('/api/identity/public/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password, name, username }),
        });
      }

      const auth = await apiCall<AuthResponse>('/api/identity/public/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      saveTokens(auth.access_token, auth.refresh_token);
      router.push('/workspaces');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicLayout
      right={
        <>
          <Link href="/"><Button>Home</Button></Link>
          <Link href={mode === 'signup' ? '/auth?mode=signin' : '/auth?mode=signup'}>
            <Button variant="primary">{mode === 'signup' ? 'Switch to sign in' : 'Switch to sign up'}</Button>
          </Link>
        </>
      }
    >
      <div className="mx-auto grid w-full max-w-7xl place-items-center">
        <Card className="w-full max-w-xl p-6 md:p-8">
          <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[#4E4E4E]" style={{ fontFamily: 'var(--font-archivo-narrow), sans-serif' }}>
            {mode === 'signup' ? 'Create account' : 'Sign in'}
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.03em] text-[#1A1A1A]">
            {mode === 'signup' ? 'Get started' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm text-[#1A1A1A]">After authentication, you will continue to workspace selection.</p>

          <div className="mt-6 grid gap-3">
            <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="demo@example.com" /></div>
            <div><Label>Password</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password" /></div>
            {mode === 'signup' ? (
              <>
                <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Demo User" /></div>
                <div><Label>Username</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="demo" /></div>
              </>
            ) : null}
          </div>

          {error ? <p className="mt-4 text-sm font-medium text-[#1A1A1A]">{error}</p> : null}

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" onClick={submit} disabled={loading}>{loading ? 'Processing...' : mode === 'signup' ? 'Sign up and continue' : 'Sign in'}</Button>
            <Button onClick={continueWithGoogle} disabled={loading}>Continue with Google</Button>
            <Link href={mode === 'signup' ? '/auth?mode=signin' : '/auth?mode=signup'}>
              <Button>{mode === 'signup' ? 'I already have an account' : 'Create a new account'}</Button>
            </Link>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-[#1A1A1A]">Loading...</div>}>
      <AuthClientPage />
    </Suspense>
  );
}
