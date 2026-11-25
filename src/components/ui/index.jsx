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
  return <div className={cn('blur-in rounded-2xl border border-line bg-white', className)} {...p} />;
}

const tones = {
  brand: 'bg-brand-soft text-brand',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  alert: 'bg-bad text-white',
  missed: 'bg-white text-bad-strong ring-1 ring-inset ring-bad-line',
  muted: 'bg-ground text-muted',
};

export function Badge({ tone = 'muted', className, ...p }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap', tones[tone], className)} {...p} />;
}

export function Spinner({ className }) {
  return <span aria-label="Memuat" role="status" className={cn('inline-block size-5 animate-spin rounded-full border-2 border-brand/25 border-t-brand', className)} />;
}

/**
 * Placeholder "blur-up" saat data dimuat: bentuk buram dari tata letak yang akan muncul.
 * variant: list (kartu), chart (grafik besar), page (judul + kartu), line (satu baris).
 */
export function BlurLoading({ variant = 'list', className }) {
  const block = 'rounded-2xl bg-line';
  return (
    <div role="status" aria-label="Memuat" className={cn('pointer-events-none flex flex-col gap-3 py-2', className)}>
      <div className="blur-ghost flex flex-col gap-3" aria-hidden="true">
        {variant === 'line' && <div className={cn(block, 'h-9 w-2/3')} />}
        {variant === 'page' && <><div className={cn(block, 'h-8 w-1/2')} /><div className={cn(block, 'h-24')} /></>}
        {variant === 'chart' && <><div className={cn(block, 'h-6 w-1/3')} /><div className={cn(block, 'h-64')} /></>}
        {(variant === 'list' || variant === 'page') && <>
          <div className={cn(block, 'h-20')} /><div className={cn(block, 'h-20 opacity-80')} /><div className={cn(block, 'h-20 opacity-60')} />
        </>}
      </div>
    </div>
  );
}

export function Alert({ tone = 'bad', children, className }) {
  return <div role="alert" className={cn('rounded-xl px-3.5 py-2.5 text-sm font-medium', tones[tone], className)}>{children}</div>;
}

/** Logo SiQura: maskot kura-kura laboratorium. */
export function Logo({ size = 36, className }) {
  return (
    <img src="/icons/logo-256.png" alt="" width={size} height={size}
      className={cn('shrink-0 rounded-[28%] bg-white object-cover', className)} style={{ width: size, height: size }} />
  );
}
