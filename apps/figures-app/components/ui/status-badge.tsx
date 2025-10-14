'use client';

import clsx from 'clsx';

interface StatusBadgeProps {
  status: string;
}

const STYLE_MAP: Record<string, string> = {
  ready: 'bg-purple-500/15 text-purple-200 border border-purple-500/30',
  available: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  locked: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
  completed: 'bg-sky-500/15 text-sky-200 border border-sky-500/30',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide';
  const style = STYLE_MAP[status] ?? 'bg-slate-700 text-slate-200 border border-slate-600/40';
  return <span className={clsx(base, style)}>{status}</span>;
}
