import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { applyUpdate, dismissUpdate, useNeedRefresh } from '@/lib/swUpdate';
import { Button } from '@/components/ui';

/** Pemberitahuan versi baru: di atas menu bawah (HP) atau pojok kanan bawah (desktop). */
export default function UpdatePrompt() {
  const need = useNeedRefresh();
  const [busy, setBusy] = useState(false);
  if (!need) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-[0_12px_32px_rgba(19,32,31,0.28)] motion-safe:animate-[siqura-rise_320ms_cubic-bezier(0.22,1,0.36,1)] lg:inset-x-auto lg:right-6 lg:bottom-6 print:hidden">
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
  );
}
