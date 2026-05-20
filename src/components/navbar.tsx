'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-provider';
import { Button } from './ui';

export function Navbar({ right }: { right?: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, loading, signOut } = useAuth();

  function logout() {
    signOut();
    router.push('/auth?mode=signin');
  }

  return (
    <header className="w-full border-b border-[#6B6B6B] bg-[#D9D6D0] px-4 py-4 md:px-8">
      <div className="flex w-full items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3 hover:opacity-90">
          <div className="grid h-8 w-8 place-items-center border border-[#6B6B6B] bg-[#D4E157] text-sm font-extrabold">S</div>
          <div>
            <p className="text-base font-extrabold tracking-[0.02em] text-[#1A1A1A]">slack</p>
            <p className="text-xs text-[#1A1A1A]">NestJS microservices + Next.js</p>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          {right ?? (
            loading ? null : isAuthenticated ? (
              <>
                <span className="hidden text-sm text-[#4E4E4E] md:inline">{user?.name || user?.username || user?.email}</span>
                <Link href="/workspaces"><Button>Workspaces</Button></Link>
                <Button onClick={logout}>Sign out</Button>
              </>
            ) : (
              <>
                <Link href="/auth?mode=signin"><Button>Sign in</Button></Link>
                <Link href="/auth?mode=signup"><Button variant="primary">Sign up</Button></Link>
              </>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
