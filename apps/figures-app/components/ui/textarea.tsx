'use client';

import clsx from 'clsx';
import type { TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export function Textarea({ label, hint, className, id, ...props }: TextareaProps) {
  const textareaId = id ?? props.name;
  return (
    <label
      className={clsx(
        'flex flex-col gap-1 text-sm font-medium text-slate-200',
        className,
      )}
      htmlFor={textareaId}
    >
      {label && <span>{label}</span>}
      <textarea
        id={textareaId}
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white shadow-inner outline-none transition focus:border-brand-400 focus:ring-1 focus:ring-brand-400 placeholder:text-slate-500"
        {...props}
      />
      {hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}
    </label>
  );
}
