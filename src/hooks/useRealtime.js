import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** Muat ulang data otomatis saat petugas lain mengisi ceklis/indikator (HP ↔ PC). */
export function useRealtimeRefresh(tables = ['checks', 'indicator_readings']) {
  const qc = useQueryClient();
  const key = tables.join(',');
  useEffect(() => {
    const channel = supabase.channel('siqura-live');
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        qc.invalidateQueries({ queryKey: ['live'] });
      });
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, key]);
}
