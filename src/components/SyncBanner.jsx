import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RefreshCw } from 'lucide-react';
import { flushOutbox, useOutboxCount } from '@/lib/outbox';
import { friendlyError } from '@/lib/supabase';

/** Menampilkan isian yang belum terkirim dan mengirimnya otomatis saat online. */
export default function SyncBanner() {
  const count = useOutboxCount();
  const qc = useQueryClient();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [rejected, setRejected] = useState('');

  useEffect(() => {
    const flush = () => flushOutbox((_op, err) => setRejected(friendlyError(err)))
      .then(() => qc.invalidateQueries({ queryKey: ['live'] }));
    const up = () => { setOnline(true); flush(); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    flush();
    const t = setInterval(flush, 30_000);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); clearInterval(t); };
  }, [qc]);

  if (!count && online && !rejected) return null;
  return (
    <div role="status" className="sticky top-0 z-30 flex items-center gap-2 bg-[#FFF7E6] px-4 py-2 text-[13px] font-semibold text-warn">
      {online ? <RefreshCw size={16} aria-hidden="true" /> : <CloudOff size={16} aria-hidden="true" />}
      <span className="flex-1">
        {rejected
          ? `Satu isian ditolak server: ${rejected}`
          : count
            ? `${count} isian tersimpan di HP, ${online ? 'sedang dikirim…' : 'dikirim otomatis saat online'}`
            : 'Offline — isian akan disimpan di HP dulu'}
      </span>
      {rejected && <button className="underline" onClick={() => setRejected('')}>Tutup</button>}
    </div>
  );
}
