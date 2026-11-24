import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

const btn = {
  primary: 'bg-brand text-white hover:bg-brand-strong',
  outline: 'border border-field bg-white text-brand hover:bg-brand-soft',
  ghost: 'text-ink hover:bg-brand-soft',
  danger: 'bg-bad text-white hover:bg-bad-strong',
};

export const Button = forwardRef(function Button({ variant = 'primary', size = 'md', className, ...p }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        size === 'lg' ? 'h-13 px-5 text-base' : size === 'sm' ? 'h-9 px-3 text-[13px]' : 'h-11 px-4 text-sm',
        btn[variant], className,
      )}
      {...p}
    />
  );
});

export const Input = forwardRef(function Input({ className, ...p }, ref) {
  return (
    <input
      ref={ref}
      className={cn('h-12 w-full rounded-xl border border-field bg-white px-3.5 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20', className)}
      {...p}
    />
  );
});

export function Field({ label, hint, children, className }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ className, ...p }) {
  return <div className={cn('rounded-2xl border border-line bg-white', className)} {...p} />;
}

const tones = {
  brand: 'bg-brand-soft text-brand',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  muted: 'bg-ground text-muted',
};

export function Badge({ tone = 'muted', className, ...p }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap', tones[tone], className)} {...p} />;
}

export function Spinner({ className }) {
  return <span aria-label="Memuat" role="status" className={cn('inline-block size-5 animate-spin rounded-full border-2 border-brand/25 border-t-brand', className)} />;
}

export function Alert({ tone = 'bad', children, className }) {
  return <div role="alert" className={cn('rounded-xl px-3.5 py-2.5 text-sm font-medium', tones[tone], className)}>{children}</div>;
}

/** Logo sementara SiQura (ikon QR). */
export function Logo({ size = 36, className }) {
  return (
    <span className={cn('inline-flex items-center justify-center rounded-[28%] bg-white', className)} style={{ width: size, height: size }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#0E5A5F" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3M21 14v7h-7v-3" />
      </svg>
    </span>
  );
}
