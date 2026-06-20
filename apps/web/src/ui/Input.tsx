import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

// radius-sm is a sanctioned exception to the design scale. bg/width overridable via className.
const field =
  'w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted outline-none transition-[border-color,box-shadow] duration-[180ms] ease-out focus:border-accent focus:[box-shadow:var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-40 aria-[invalid=true]:border-danger';

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${field} ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${field} ${className}`} {...rest} />;
}
