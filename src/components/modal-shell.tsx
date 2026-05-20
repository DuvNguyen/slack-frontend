'use client';

import React from 'react';

type ModalShellProps = {
  title?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function ModalShell({ title, onClose, children, className = '', bodyClassName = '' }: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className={`w-full max-w-3xl border border-[#6B6B6B] bg-white ${className}`}>
        <div className="flex items-center justify-between border-b border-[#ddd] px-6 py-4">
          <div>{title}</div>
          <button onClick={onClose} className="text-2xl" aria-label="Close modal">×</button>
        </div>
        <div className={`h-[560px] overflow-y-auto px-6 py-4 ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}
