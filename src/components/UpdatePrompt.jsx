import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { applyUpdate, dismissUpdate, useNeedRefresh } from '@/lib/swUpdate';
import { Button } from '@/components/ui';

/**
 * Pemberitahuan versi baru: di atas menu bawah (HP) atau pojok kanan bawah (desktop).
 * Muncul dengan efek "gooey drop": tetesan jatuh, menyatu, lalu melebar jadi kartu.
 */
export default function UpdatePrompt() {
  const need = useNeedRefresh();
  const [busy, setBusy] = useState(false);
  if (!need) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md text-white lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[420px] print:hidden">
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <filter id="siqura-goo" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>
      <span aria-hidden="true" className="goo-shadow absolute inset-0 rounded-[18px] shadow-[0_12px_32px_rgba(19,32,31,0.28)]" />
      <span aria-hidden="true" className="goo-layer">
        <span className="goo-pill" />
        <span className="goo-drop" />
        <span className="goo-drip" />
      </span>
      <div className="goo-content relative flex items-center gap-3 px-4 py-3">
        <RefreshCw size={20} className="shrink-0 text-on-brand-muted" aria-hidden="true" />
        <span className="flex flex-1 flex-col">
          <span className="text-sm font-bold">Versi baru SiQura tersedia</span>
          <span className="text-xs text-on-brand-muted">Simpan isian yang sedang dikerjakan, lalu muat ulang.</span>
        </span>
        <Button size="sm" disabled={busy} className="bg-white text-brand hover:bg-brand-soft" onClick={() => { setBusy(true); applyUpdate(); }}>
          {busy ? 'Memuat…' : 'Muat ulang'}
        </Button>
        <button type="button" onClick={dismissUpdate} aria-label="Nanti saja" className="-mr-1 flex size-9 items-center justify-center rounded-lg text-on-brand-muted hover:bg-white/10">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
