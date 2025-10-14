'use client';

import clsx from 'clsx';
import type { SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
}

export function Select({ label, hint, className, id, children, ...props }: SelectProps) {
  const selectId = id ?? props.name;
  return (
    <label
      className={clsx(
        'flex flex-col gap-1 text-sm font-medium text-slate-200',
        className,
      )}
      htmlFor={selectId}
    >
      {label && <span>{label}</span>}
      <select
        id={selectId}
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow-inner outline-none transition focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
        {...props}
      >
        {children}
      </select>
      {hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}
    </label>
  );
}
