import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { supabase, friendlyError } from '@/lib/supabase';
import { Alert, Card, Spinner, BlurLoading } from '@/components/ui';
import { cn } from '@/lib/cn';

export default function EquipmentListPage() {
  const [params, setParams] = useSearchParams();
  const roomFilter = params.get('ruang');
  const { data, isPending, error } = useQuery({
    queryKey: ['master', 'rooms-equipment'],
    queryFn: async () => {
      const { data: rows, error: err } = await supabase.from('rooms')
        .select('id,name,equipment(id,name,category,is_active)')
        .eq('is_active', true).order('sort_order').order('name');
      if (err) throw err;
      return rows.map((r) => ({ ...r, equipment: r.equipment.filter((e) => e.is_active).sort((a, b) => a.name.localeCompare(b.name)) }));
    },
  });
  const rooms = (data ?? []).filter((r) => !roomFilter || r.id === roomFilter);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-xl font-extrabold">Ruangan &amp; Alat</h1>
      {data && data.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter ruangan">
          <Chip active={!roomFilter} onClick={() => setParams({})}>Semua</Chip>
          {data.map((r) => (
            <Chip key={r.id} active={roomFilter === r.id} onClick={() => setParams({ ruang: r.id })}>{r.name}</Chip>
          ))}
        </div>
      )}
      {error && <Alert>{friendlyError(error)}</Alert>}
      {isPending && <BlurLoading />}
      {data?.length === 0 && <Card className="p-4 text-sm text-muted">Belum ada ruangan. Admin dapat menambahkannya di Kelola Master.</Card>}
      {rooms.map((r) => (
        <section key={r.id} className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-muted">{r.name}</h2>
          {r.equipment.length === 0 && <p className="text-sm text-subtle">Belum ada alat.</p>}
          {r.equipment.map((e) => (
            <Link key={e.id} to={`/alat/${e.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-white px-3.5 py-2.5">
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-bold">{e.name}</span>
                {e.category && <span className="text-xs text-muted">{e.category}</span>}
              </span>
              <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}

function Chip({ active, ...p }) {
  return (
    <button type="button" aria-pressed={active}
      className={cn('h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold',
        active ? 'bg-brand text-white' : 'border border-field bg-white text-muted')} {...p} />
  );
}
