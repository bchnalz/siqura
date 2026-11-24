import { Link } from 'react-router-dom';
import { Bell, ChevronRight, Clock, ScanLine } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useHomeData } from '@/features/home/useHomeData';
import { useRealtimeRefresh } from '@/hooks/useRealtime';
import { currentShift, formatLongDate, greeting, SHIFT_LABEL, todayWib } from '@/lib/dates';
import { friendlyError } from '@/lib/supabase';
import { Alert, Badge, Card, Logo, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

function formatValue(v, decimals = 1) {
  return Number(v).toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function HomePage() {
  const { profile } = useAuth();
  const today = todayWib();
  const { shift, date: shiftDate } = currentShift();
  const { data, isPending, error } = useHomeData({ today, shift, shiftDate });
  useRealtimeRefresh();
  const firstName = (profile?.full_name || '').split(' ')[0];

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-4 bg-brand px-5 pt-5 pb-16 text-white">
        <div className="flex items-center gap-2.5">
          <Logo size={36} />
          <div className="flex flex-1 flex-col">
            <span className="text-lg font-extrabold">SiQura</span>
            <span className="text-xs text-on-brand-muted">Lab Mikrobiologi Klinik &amp; Biomolekuler</span>
          </div>
          <Link to="/akun" aria-label="Notifikasi" className="relative flex size-11 items-center justify-center rounded-xl bg-brand-tint">
            <Bell size={20} aria-hidden="true" />
            {data?.lateCount > 0 && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-heat-none" />}
          </Link>
        </div>
        <div>
          <p className="text-[13px] text-on-brand-muted">{formatLongDate(today)} · Shift {SHIFT_LABEL[shift]}</p>
          <h1 className="text-[22px] font-bold">{greeting(shift)}{firstName ? `, ${firstName}` : ''}</h1>
        </div>
      </header>

      <Card className="mx-4 -mt-12 grid grid-cols-3 gap-2 border-0 p-4 shadow-[0_6px_20px_rgba(14,90,95,0.12)]">
        <Stat value={data?.tasksToday} label="Tugas hari ini" className="text-brand" />
        <Stat value={data?.lateCount} label="Terlambat" className="text-bad" divided />
        <Stat value={data?.pendingIndicators} label="Indikator belum dicatat" className="text-warn-strong" />
      </Card>

      <div className="flex flex-col gap-4 p-4">
        {error && <Alert>{friendlyError(error)}</Alert>}

        {data?.lateItems?.[0] && (
          <Link to={`/alat/${data.lateItems[0].equipment_id}`}
            className="flex items-center gap-3 rounded-2xl border border-bad-line bg-bad-soft px-3.5 py-3">
            <Clock className="shrink-0 text-bad" size={22} aria-hidden="true" />
            <span className="flex flex-1 flex-col">
              <span className="text-[13px] font-bold text-bad-strong">
                {data.lateItems[0].name} — terlambat {data.lateItems[0].days} hari
              </span>
              <span className="text-xs text-muted">
                {data.lateItems[0].equipmentName} · {data.lateItems[0].roomName}
                {data.lateItems.length > 1 && ` · +${data.lateItems.length - 1} lainnya`}
              </span>
            </span>
            <ChevronRight size={18} className="text-bad-strong" aria-hidden="true" />
          </Link>
        )}

        <Link to="/scan" className="flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-brand text-base font-bold text-white">
          <ScanLine size={22} aria-hidden="true" /> Scan QR Alat / Ruangan
        </Link>

        {isPending && <div className="flex justify-center py-8"><Spinner /></div>}

        {data && data.indicatorCards.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold">Indikator ruangan · {SHIFT_LABEL[shift]}</h2>
              <Link to="/indikator" className="text-[13px] font-semibold text-brand">Catat</Link>
            </div>
            {data.indicatorCards.map((c) => (
              <Link key={c.room.id} to={`/indikator?ruang=${c.room.id}`} className="flex flex-col gap-2 rounded-2xl border border-line bg-white px-3.5 py-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{c.room.name}</span>
                  {c.complete
                    ? <Badge tone={c.anyOut ? 'bad' : 'ok'}>{c.anyOut ? 'Ada di luar batas' : 'Sudah dicatat'}</Badge>
                    : <Badge tone="warn">Belum {SHIFT_LABEL[shift].toLowerCase()}</Badge>}
                </span>
                <span className="grid grid-cols-3 gap-1.5">
                  {c.items.slice(0, 3).map(({ target, indicator, reading }) => (
                    <span key={target.id} className={cn('flex flex-col rounded-xl px-2 py-1.5',
                      !reading ? 'bg-ground' : reading.is_out_of_range ? 'bg-bad-soft' : 'bg-ok-soft')}>
                      <span className="truncate text-xs text-muted">{indicator.name}</span>
                      <span className={cn('text-[15px] font-bold', !reading ? 'text-subtle' : reading.is_out_of_range ? 'text-bad' : 'text-ok')}>
                        {reading ? `${formatValue(reading.value, indicator.decimals)} ${indicator.unit}` : '—'}
                      </span>
                    </span>
                  ))}
                </span>
              </Link>
            ))}
          </section>
        )}

        {data && (
          <section className="flex flex-col gap-2.5">
            <h2 className="text-base font-bold">Ceklis alat per ruangan</h2>
            {data.roomProgress.length === 0 && (
              <Card className="p-4 text-sm text-muted">
                Belum ada ruangan & alat. Admin dapat menambahkannya di menu Kelola Master.
              </Card>
            )}
            {data.roomProgress.map((p) => (
              <Link key={p.room.id} to={`/alat?ruang=${p.room.id}`} className="flex flex-col gap-2 rounded-2xl border border-line bg-white px-3.5 py-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="text-sm font-bold">{p.room.name}</span>
                    <span className="text-xs text-muted">{p.equipmentCount} alat{p.late ? ` · ${p.late} terlambat` : ''}</span>
                  </span>
                  <span className={cn('text-[13px] font-bold', p.late ? 'text-bad' : p.pct === 100 ? 'text-ok' : 'text-brand')}>
                    {p.done}/{p.total}
                  </span>
                </span>
                <span className="block h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progres ${p.room.name}`}>
                  <span className={cn('block h-1.5 rounded-full', p.late ? 'bg-bad' : p.pct === 100 ? 'bg-ok' : 'bg-brand')} style={{ width: `${p.pct}%` }} />
                </span>
              </Link>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label, className, divided }) {
  return (
    <div className={cn('flex flex-col items-center gap-0.5', divided && 'border-x border-line')}>
      <span className={cn('text-2xl font-extrabold', className)}>{value ?? '–'}</span>
      <span className="text-center text-xs text-muted">{label}</span>
    </div>
  );
}
