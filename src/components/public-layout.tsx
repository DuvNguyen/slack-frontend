'use client';

import React from 'react';
import { Footer } from './footer';
import { Navbar } from './navbar';

export function PublicLayout({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen w-full flex-col bg-[#D9D6D0] text-[#1A1A1A]">
      <Navbar right={right} />
      <section className="flex w-full flex-1 px-4 py-4 md:px-8 md:py-6">
        <div className="w-full">{children}</div>
      </section>
      <Footer />
    </main>
  );
}
