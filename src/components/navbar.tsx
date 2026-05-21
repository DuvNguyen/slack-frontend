'use client';

import Link from 'next/link';
import Image from 'next/image';
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
        <Link href="/" className="flex items-center gap-1 hover:opacity-90">
          <Image src="/slack_icon.png" alt="Slack Logo" width={56} height={56} className="h-14 w-14 object-contain mix-blend-multiply scale-[2]" />
          <span className="text-3xl font-extrabold tracking-tight text-[#1A1A1A] ml-2">SLACK</span>
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
