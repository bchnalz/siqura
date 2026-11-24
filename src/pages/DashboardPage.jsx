import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeRefresh } from '@/hooks/useRealtime';
import { addDays, currentShift, dueStatus, formatLongDate, formatShortDate, SHIFT_LABEL, SHIFTS, todayWib } from '@/lib/dates';
import { rows } from '@/lib/api';
import { friendlyError, supabase } from '@/lib/supabase';
import { Alert, Badge, Card, Spinner } from '@/components/ui';
import IndicatorChart from '@/components/IndicatorChart';
import { cn } from '@/lib/cn';

/** Dashboard desktop: ringkasan kepatuhan, indikator, keterlambatan. */
export default function DashboardPage() {
  const { profile } = useAuth();
  const today = todayWib();
  const monthStart = `${today.slice(0, 7)}-01`;
  const { shift, date: shiftDate } = currentShift();
  useRealtimeRefresh();

  const q = useQuery({
    queryKey: ['live', 'dashboard', today, shiftDate],
    queryFn: async () => {
      const [rooms, equipment, statuses, comp, targets, todayReadings, outs, staff] = await Promise.all([
        rows(supabase.from('rooms').select('id,name,sort_order').eq('is_active', true).order('sort_order').order('name')),
        rows(supabase.from('equipment').select('id,room_id,name').eq('is_active', true)),
        rows(supabase.from('activity_status').select('*')),
        rows(supabase.rpc('daily_compliance', { p_from: monthStart, p_to: today })),
        rows(supabase.from('indicator_targets')
          .select('id,room_id,equipment_id,indicator:indicators!inner(id,name,unit,min_value,max_value,decimals,shifts,is_active),room:rooms(name),equipment:equipment(name,room:rooms(name))')
          .eq('is_active', true).eq('indicator.is_active', true)),
        rows(supabase.from('indicator_readings').select('target_id,shift').eq('reading_date', shiftDate)),
        rows(supabase.from('indicator_readings').select('id,target_id,reading_date,shift,value,corrective_action,initials')
          .eq('is_out_of_range', true).gte('reading_date', addDays(today, -6)).order('reading_date', { ascending: false }).limit(20)),
        rows(supabase.from('profiles').select('id').eq('is_active', true)),
      ]);
      return { rooms, equipment, statuses, comp, targets, todayReadings, outs, staff };
    },
  });

  const view = useMemo(() => {
    if (!q.data) return null;
    const { rooms, equipment, statuses, comp, targets, todayReadings, outs, staff } = q.data;
    const eqName = new Map(equipment.map((e) => [e.id, e.name]));
    const roomName = new Map(rooms.map((r) => [r.id, r.name]));
    const late = statuses.map((s) => ({ ...s, st: dueStatus(s, today) })).filter((s) => s.st.key === 'late').sort((a, b) => b.st.days - a.st.days);
    const total = comp.reduce((a, c) => a + c.daily_total, 0);
    const filled = comp.reduce((a, c) => a + c.filled, 0);
    const days = Array.from({ length: Number(today.slice(8)) }, (_, i) => addDays(monthStart, i));
    const heat = rooms.map((r) => ({
      room: r,
      cells: days.map((d) => comp.find((c) => c.room_id === r.id && c.day === d) ?? null),
    })).filter((h) => h.cells.some(Boolean));
    const targetLabel = (t) => t ? `${t.indicator.name} · ${t.room?.name ?? `${t.equipment?.name}`}` : '';
    const byTarget = new Map(targets.map((t) => [t.id, t]));
    const roomTargets = new Map();
    for (const t of targets) {
      const key = t.room_id ? t.room?.name : `${t.equipment?.name} (${t.equipment?.room?.name ?? ''})`;
      if (!roomTargets.has(key)) roomTargets.set(key, []);
      roomTargets.get(key).push(t);
    }
    const indicatorToday = [...roomTargets.entries()].map(([name, ts]) => ({
      name,
      cells: SHIFTS.map((s) => {
        const sched = ts.filter((t) => t.indicator.shifts.includes(s));
        if (!sched.length) return { key: 'none' };
        const done = sched.filter((t) => todayReadings.some((r) => r.target_id === t.id && r.shift === s)).length;
        const isPast = SHIFTS.indexOf(s) < SHIFTS.indexOf(shift);
        const isNow = s === shift;
        return { key: done === sched.length ? 'done' : isPast ? 'missed' : isNow ? 'pending' : 'later', done, total: sched.length };
      }),
    }));
    return {
      late, eqName, roomName, heat, days, indicatorToday, byTarget, targetLabel,
      compliance: total ? Math.round((filled / total) * 100) : null, total, filled,
      outs, staffCount: staff.length, equipmentCount: equipment.length, roomCount: rooms.length, targets,
    };
  }, [q.data, today, monthStart, shift]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Dashboard</h1>
          <p className="text-[13px] text-muted">{formatLongDate(today)} · Shift {SHIFT_LABEL[shift]} · {profile?.full_name}</p>
        </div>
      </header>
      {q.error && <Alert>{friendlyError(q.error)}</Alert>}
      {q.isPending && <div className="flex justify-center py-16"><Spinner /></div>}
      {view && (
        <>
          <Card className="grid grid-cols-2 divide-line xl:grid-cols-4 xl:divide-x">
            <Kpi label="Kepatuhan ceklis harian bulan ini" value={view.compliance === null ? '–' : `${view.compliance}%`} note={`${view.filled} dari ${view.total} isian`} className="text-brand" />
            <Kpi label="Kegiatan terlambat" value={view.late.length} note={`di ${new Set(view.late.map((l) => l.equipment_id)).size} alat`} className={view.late.length ? 'text-bad' : 'text-ok'} />
            <Kpi label="Indikator di luar batas" value={view.outs.length} note="7 hari terakhir" className={view.outs.length ? 'text-warn-strong' : 'text-ok'} />
            <Kpi label="Alat terdaftar" value={view.equipmentCount} note={`di ${view.roomCount} ruangan · ${view.staffCount} petugas aktif`} />
          </Card>

          <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <DashboardChart targets={view.targets} label={view.targetLabel} today={today} />
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-base font-bold">Indikator hari ini</h2>
              {view.indicatorToday.length === 0 ? <p className="text-sm text-muted">Belum ada indikator.</p> : (
                <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] items-center gap-x-1.5 gap-y-2 text-xs">
                  <span className="font-semibold text-subtle">Lokasi</span>
                  {SHIFTS.map((s) => <span key={s} className="text-center font-semibold text-subtle">{SHIFT_LABEL[s]}</span>)}
                  {view.indicatorToday.map((r) => (
                    <IndicatorRow key={r.name} row={r} />
                  ))}
                </div>
              )}
            </Card>
          </section>

          <Card className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold">Kepatuhan ceklis harian per ruangan · {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(today + 'T00:00:00Z'))}</h2>
              <span className="flex gap-3 text-xs text-muted">
                <Legend c="bg-heat-full" t="100%" /><Legend c="bg-heat-part" t="sebagian" /><Legend c="bg-heat-none" t="kosong" />
              </span>
            </div>
            {view.heat.length === 0 ? <p className="text-sm text-muted">Belum ada kegiatan harian.</p> : (
              <div className="overflow-x-auto">
                <div className="flex min-w-[720px] flex-col gap-1.5">
                  {view.heat.map((h) => (
                    <div key={h.room.id} className="grid items-center gap-[3px]" style={{ gridTemplateColumns: `160px repeat(${view.days.length}, minmax(0,1fr))` }}>
                      <span className="truncate text-xs font-semibold">{h.room.name}</span>
                      {h.cells.map((c, i) => {
                        const pct = c && c.daily_total ? c.filled / c.daily_total : null;
                        return <span key={i} title={c ? `${formatShortDate(view.days[i])}: ${c.filled}/${c.daily_total}` : ''}
                          className={cn('h-6 rounded', pct === null ? 'bg-line' : pct >= 1 ? 'bg-heat-full' : pct > 0 ? 'bg-heat-part' : 'bg-heat-none')} />;
                      })}
                    </div>
                  ))}
                  <div className="grid gap-[3px] text-center text-[11px] text-subtle" style={{ gridTemplateColumns: `160px repeat(${view.days.length}, minmax(0,1fr))` }}>
                    <span />{view.days.map((d) => <span key={d}>{Number(d.slice(8))}</span>)}
                  </div>
                </div>
              </div>
            )}
          </Card>

          <section className="grid gap-4 xl:grid-cols-2">
            <Card className="flex flex-col gap-2 p-5">
              <h2 className="text-base font-bold">Kegiatan terlambat</h2>
              {view.late.length === 0 ? <p className="text-sm text-muted">Tidak ada. Bagus!</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[440px] border-collapse text-[13px]">
                    <thead><tr className="text-left text-xs text-subtle"><th className="py-2 pr-2 font-semibold">Alat · Ruangan</th><th className="py-2 pr-2 font-semibold">Kegiatan</th><th className="py-2 pr-2 font-semibold">Interval</th><th className="py-2 font-semibold">Terlambat</th></tr></thead>
                    <tbody>
                      {view.late.slice(0, 12).map((l) => (
                        <tr key={l.activity_id} className="border-t border-line">
                          <td className="py-2.5 pr-2"><Link to={`/alat/${l.equipment_id}`} className="font-semibold text-brand hover:underline">{view.eqName.get(l.equipment_id)}</Link><span className="block text-xs text-muted">{view.roomName.get(l.room_id)}</span></td>
                          <td className="py-2.5 pr-2">{l.name}</td>
                          <td className="py-2.5 pr-2 text-muted">{l.interval_days} hari</td>
                          <td className="py-2.5 font-bold text-bad">{l.st.days} hari</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card className="flex flex-col gap-2 p-5">
              <h2 className="text-base font-bold">Di luar batas & tindakan korektif · 7 hari</h2>
              {view.outs.length === 0 ? <p className="text-sm text-muted">Semua nilai dalam batas normal.</p> : view.outs.map((o) => {
                const t = view.byTarget.get(o.target_id);
                return (
                  <div key={o.id} className="flex flex-col gap-0.5 border-t border-line pt-2.5">
                    <span className="flex justify-between gap-2 text-[13px]"><b>{view.targetLabel(t)}</b><b className="whitespace-nowrap text-bad">{Number(o.value).toLocaleString('id-ID')} {t?.indicator.unit}</b></span>
                    <span className="text-xs text-muted">{formatShortDate(o.reading_date)}, {SHIFT_LABEL[o.shift].toLowerCase()} · {o.initials}</span>
                    <span className="text-xs text-ink-soft">{o.corrective_action}</span>
                  </div>
                );
              })}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, note, className }) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-4">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className={cn('tnum text-[28px] leading-tight font-extrabold', className)}>{value}</span>
      <span className="text-xs text-subtle">{note}</span>
    </div>
  );
}

const Legend = ({ c, t }) => <span className="flex items-center gap-1.5"><span className={cn('size-3 rounded-sm', c)} />{t}</span>;

const cellStyle = {
  done: { tone: 'ok', t: '✓' }, missed: { tone: 'bad', t: 'terlewat' }, pending: { tone: 'warn', t: 'belum' },
  later: { tone: 'muted', t: '—' }, none: { tone: 'muted', t: '·' },
};
function IndicatorRow({ row }) {
  return (
    <>
      <span className="leading-snug font-semibold">{row.name}</span>
      {row.cells.map((c, i) => (
        <span key={i} className="justify-self-center"><Badge tone={cellStyle[c.key].tone}>{cellStyle[c.key].t}</Badge></span>
      ))}
    </>
  );
}

function DashboardChart({ targets, label, today }) {
  const [id, setId] = useState(targets[0]?.id);
  const t = targets.find((x) => x.id === id) ?? targets[0];
  const from = addDays(today, -29);
  const q = useQuery({
    queryKey: ['live', 'chart', t?.id, from, today],
    enabled: Boolean(t),
    queryFn: () => rows(supabase.from('indicator_readings').select('reading_date,shift,value,is_out_of_range')
      .eq('target_id', t.id).gte('reading_date', from).lte('reading_date', today)),
  });
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">Grafik 30 hari</h2>
        {targets.length > 0 && (
          <select aria-label="Pilih indikator" value={t?.id} onChange={(e) => setId(e.target.value)}
            className="h-10 max-w-full rounded-xl border border-field bg-white px-3 text-[13px] font-semibold">
            {targets.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}
          </select>
        )}
      </div>
      {!t ? <p className="text-sm text-muted">Belum ada indikator.</p>
        : q.isPending ? <div className="flex justify-center py-10"><Spinner /></div>
        : <IndicatorChart readings={q.data ?? []} from={from} to={today} indicator={t.indicator} width={720} height={240} />}
    </Card>
  );
}
