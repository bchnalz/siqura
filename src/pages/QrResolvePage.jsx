import { Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Alert, Spinner } from '@/components/ui';

/**
 * Tujuan link QR: /q?eq=<id alat>  atau  /q?room=<nama ruangan>&eq=<nama alat>
 * (format nama sama dengan aplikasi lama, agar mudah dimigrasi).
 */
export default function QrResolvePage() {
  const [params] = useSearchParams();
  const eq = params.get('eq')?.trim();
  const room = params.get('room')?.trim();
  const isId = /^[0-9a-f-]{36}$/i.test(eq ?? '');

  const { data, isPending } = useQuery({
    queryKey: ['qr', room, eq],
    enabled: Boolean(eq) && !isId,
    queryFn: async () => {
      const exact = (v) => v.replace(/[%_\\]/g, '\\$&');
      let q = supabase.from('equipment').select('id, rooms!inner(name)').ilike('name', exact(eq));
      if (room) q = q.ilike('rooms.name', exact(room));
      const { data: rows, error } = await q.limit(1);
      if (error) throw error;
      return rows[0] ?? null;
    },
  });

  if (isId) return <Navigate to={`/alat/${eq}`} replace />;
  if (!eq) return <Navigate to="/" replace />;
  if (isPending) return <div className="flex min-h-dvh items-center justify-center"><Spinner /></div>;
  if (data) return <Navigate to={`/alat/${data.id}`} replace />;
  return (
    <div className="p-4 pt-8">
      <Alert>Alat “{eq}”{room ? ` di ${room}` : ''} tidak ditemukan. Mungkin namanya sudah diubah — minta admin mencetak ulang QR.</Alert>
    </div>
  );
}
