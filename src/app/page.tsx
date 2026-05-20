'use client';

import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import { PublicLayout } from '@/components/public-layout';
import { useAuth } from '@/components/auth-provider';

export default function LandingPage() {
  const { isAuthenticated, loading } = useAuth();

  return (
    <PublicLayout>
      <div className="grid w-full">
        <Card className="grid min-h-[calc(100vh-220px)] w-full place-items-center px-6 py-10 md:px-12">
          <div className="mx-auto max-w-5xl text-center">
            <p className="mb-4 text-[0.72rem] uppercase tracking-[0.1em] text-[#4E4E4E]" style={{ fontFamily: 'var(--font-archivo-narrow), sans-serif' }}>
              Concrete Lemon / Landing
            </p>
            <h1 className="text-5xl font-extrabold leading-[0.92] tracking-[-0.04em] text-[#1A1A1A] md:text-8xl">
              All your people and
              <br />
              your workspaces together.
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-[#1A1A1A]">
              A Slack-inspired MVP with a focused entry point: sign up or sign in, then continue to workspace selection.
            </p>
            <div className="mt-9 flex items-center justify-center gap-3">
              {loading ? null : isAuthenticated ? (
                <Link href="/workspaces"><Button variant="primary">Continue to workspaces</Button></Link>
              ) : (
                <>
                  <Link href="/auth?mode=signup"><Button variant="primary">Create account</Button></Link>
                  <Link href="/auth?mode=signin"><Button>Sign in</Button></Link>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}
