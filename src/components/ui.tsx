'use client';

import Link from 'next/link';
import React from 'react';

export function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen w-full bg-[#D9D6D0] text-[#1A1A1A]">{children}</main>;
}

export function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 md:px-8 ${className}`}>{children}</div>;
}

export function AppHeader({
  right,
  subtitle = 'NestJS microservices + Next.js',
}: {
  right?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border border-[#6B6B6B] bg-[#D9D6D0] px-4 py-3">
      <div>
        <p className="text-[0.72rem] uppercase tracking-[0.1em] text-[#4E4E4E]" style={{ fontFamily: 'var(--font-archivo-narrow), sans-serif' }}>
          Slack MVP
        </p>
        <p className="text-xs text-[#1A1A1A]">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="border-t border-[#6B6B6B] bg-[#D9D6D0] px-4 py-4 text-xs text-[#4E4E4E]">
      <Container className="flex flex-col items-center justify-between gap-2 px-0 md:flex-row md:px-0">
        <p>Concrete Lemon design system · Slack-inspired workflow</p>
        <div className="flex items-center gap-3">
          <Link href="/" className="hover:text-[#1A1A1A]">Home</Link>
          <Link href="/auth?mode=signin" className="hover:text-[#1A1A1A]">Sign in</Link>
          <Link href="/workspaces" className="hover:text-[#1A1A1A]">Workspaces</Link>
        </div>
      </Container>
    </footer>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="text-[0.72rem] uppercase tracking-[0.1em] text-[#4E4E4E]"
      style={{ fontFamily: 'var(--font-archivo-narrow), sans-serif' }}
    >
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full border border-[#6B6B6B] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#6B6B6B] focus:outline-none"
    />
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`border border-[#6B6B6B] bg-[#F0EDE6] ${className}`}>{children}</div>;
}

export function Button({
  children,
  variant = 'secondary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const base = 'px-4 py-2 text-sm border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const style =
    variant === 'primary'
      ? 'bg-[#D4E157] border-[#D4E157] text-[#1A1A1A] font-semibold hover:brightness-95'
      : 'bg-transparent border-[#6B6B6B] text-[#1A1A1A] hover:bg-[#E6E2DA]';
  return (
    <button {...props} className={`${base} ${style}`}>
      {children}
    </button>
  );
}
