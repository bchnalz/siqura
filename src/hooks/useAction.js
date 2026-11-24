import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { friendlyError } from '@/lib/supabase';

/** Jalankan aksi simpan/hapus dengan status sibuk, pesan error, lalu muat ulang data. */
export function useAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (fn) => {
    setBusy(true); setError('');
    try {
      const out = await fn();
      await Promise.all([qc.invalidateQueries({ queryKey: ['master'] }), qc.invalidateQueries({ queryKey: ['live'] })]);
      return out ?? true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [qc]);
  return { run, busy, error, setError };
}

/** Lempar error Supabase bila ada (untuk dipakai di dalam run). */
export async function must(q) {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
