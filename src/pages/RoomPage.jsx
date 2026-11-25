import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, PencilLine, Printer } from 'lucide-react';
import { useRealtimeRefresh } from '@/hooks/useRealtime';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { monthDays, monthLabel, useReadings, useRoom } from '@/features/rooms/api';
import { addDays, currentShift, dueStatus, formatLongDate, formatShortDate, SHIFT_LABEL, SHIFTS, todayWib } from '@/lib/dates';
import { formatValue, rangeText, SLOT, slotStatus } from '@/lib/status';
import { friendlyError } from '@/lib/supabase';
import { Alert, Badge, Card, Spinner } from '@/components/ui';
import IndicatorChart from '@/components/IndicatorChart';
import MonitoringChart from '@/components/MonitoringChart';
import ReportToTechnician from '@/components/ReportToTechnician';
import { cn } from '@/lib/cn';

/** Halaman ruangan: pusat informasi indikator & alat satu ruangan. */
export default function RoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useRoom(id);
  const isDesktop = useIsDesktop();
  useRealtimeRefresh();

  return (
    <div className="flex min-h-dvh flex-col lg:min-h-0 lg:gap-4">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-white px-3 py-2.5 lg:static lg:rounded-2xl lg:border lg:px-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Kembali"
          className="flex size-11 items-center justify-center rounded-xl hover:bg-ground">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-lg font-extrabold lg:text-xl">{q.data?.room.name ?? 'Ruangan'}</h1>
          {q.data && <p className="truncate text-xs text-muted">{q.data.targets.length} indikator · {q.data.equipment.length} alat</p>}
        </div>
        {q.data && isDesktop && (
          <ReportToTechnician roomId={id} roomName={q.data.room.name} path={`/ruang/${id}`} />
        )}
      </header>
      {q.error && <Alert className="m-4 lg:m-0">{friendlyError(q.error)}</Alert>}
      {q.isPending && <div className="flex justify-center py-10"><Spinner /></div>}
      {q.data && (isDesktop ? <RoomDesktop data={q.data} /> : <RoomMobile data={q.data} />)}
    </div>
  );
}

/* ------------------------------- HP ------------------------------- */

function RoomMobile({ data }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'alat' ? 'alat' : 'indikator';
  return (
    <>
      <div role="tablist" className="grid grid-cols-2 border-b border-line bg-white">
        {[['indikator', `Indikator (${data.targets.length})`], ['alat', `Alat (${data.equipment.length})`]].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'indikator' ? {} : { tab: k }, { replace: true })}
            className={cn('h-11 border-b-[3px] text-sm', tab === k ? 'border-brand font-bold text-brand' : 'border-transparent font-semibold text-subtle')}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'indikator' ? <MobileIndicators data={data} /> : (
        <div className="flex flex-col gap-3 p-4">
          <EquipmentList equipment={data.equipment} statuses={data.statuses} />
          <ReportToTechnician roomId={data.room.id} roomName={data.room.name} path={`/ruang/${data.room.id}`} />
        </div>
      )}
    </>
  );
}

function MobileIndicators({ data }) {
  const now = currentShift();
  const today = todayWib();
  const [date, setDate] = useState(now.date);
  const stripFrom = addDays(now.date, -13);
  const from = date < stripFrom ? addDays(date, -6) : stripFrom;
  const ids = data.targets.map((t) => t.id);
  const readings = useReadings(ids, from, now.date);
  const touch = useRef(null);
  const go = (n) => setDate((d) => { const x = addDays(d, n); return x > now.date ? d : x; });

  if (!data.targets.length) {
    return <Card className="m-4 p-4 text-sm text-muted">Ruangan ini belum punya indikator. Admin dapat memasangnya di Kelola Master → Indikator.</Card>;
  }
  const locs = [...new Set(data.targets.map((t) => t.lok))];

  return (
    <div className="flex flex-col gap-3 p-4">
      <DateStrip from={stripFrom} to={now.date} value={date} onChange={setDate} targets={data.targets} readings={readings.data ?? []} now={now} today={today} />

      <div className="flex items-center justify-between gap-2"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (Math.abs(dx) > 60) go(dx > 0 ? -1 : 1); touch.current = null; }}>
        <button type="button" onClick={() => go(-1)} aria-label="Hari sebelumnya" className="flex size-10 items-center justify-center rounded-xl border border-line bg-white"><ChevronLeft size={18} aria-hidden="true" /></button>
        <h2 className="text-center text-[15px] font-bold">{formatLongDate(date)}</h2>
        <button type="button" onClick={() => go(1)} disabled={date >= now.date} aria-label="Hari berikutnya" className="flex size-10 items-center justify-center rounded-xl border border-line bg-white disabled:opacity-40"><ChevronRight size={18} aria-hidden="true" /></button>
      </div>

      {readings.error && <Alert>{friendlyError(readings.error)}</Alert>}
      {readings.isPending ? <div className="flex justify-center py-6"><Spinner /></div> : (
        <DayLog targets={data.targets} readings={readings.data} date={date} now={now} />
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(locs.length, 2)}, minmax(0,1fr))` }}>
        {locs.slice(0, 2).map((lok) => {
          const t = data.targets.find((x) => x.lok === lok);
          return (
            <Link key={lok} to={`/indikator?lok=${lok}`} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-3 text-sm font-bold text-white">
              <PencilLine size={17} aria-hidden="true" /> <span className="truncate">Catat{t.where ? ` ${t.where}` : ' indikator'}</span>
            </Link>
          );
        })}
      </div>

      {readings.data && <WeekChart targets={data.targets} readings={readings.data} date={date} />}
      <ReportToTechnician roomId={data.room.id} roomName={data.room.name} path={`/ruang/${data.room.id}`} />
    </div>
  );
}

function dayState(targets, readings, d, now) {
  let out = 0, missed = 0, total = 0, done = 0;
  for (const t of targets) {
    for (const s of t.indicator.shifts) {
      const r = readings.find((x) => x.target_id === t.id && x.reading_date === d && x.shift === s);
      const st = slotStatus({ date: d, shift: s, reading: r, indicator: t.indicator, now });
      if (st === 'upcoming' || st === 'none') continue;
      total++;
      if (st === 'out') out++;
      if (st === 'missed') missed++;
      if (st === 'recorded' || st === 'out') done++;
    }
  }
  if (out) return 'out';
  if (missed) return 'missed';
  if (total && done === total) return 'recorded';
  return 'pending';
}

const DOT = { out: 'bg-bad', missed: 'bg-heat-none', recorded: 'bg-ok', pending: 'bg-field' };

function DateStrip({ from, to, value, onChange, targets, readings, now, today }) {
  const ref = useRef(null);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(from, i)).filter((d) => d <= to), [from, to]);
  const wd = (d) => new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z'));
  useEffect(() => { ref.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [value]);

  return (
    <div className="flex items-stretch gap-2">
      <div ref={ref} className="-ml-4 flex flex-1 snap-x gap-1.5 overflow-x-auto pr-1 pl-4 [scrollbar-width:none]" role="group" aria-label="Pilih tanggal">
        {days.map((d) => {
          const st = dayState(targets, readings, d, now);
          return (
            <button key={d} type="button" aria-pressed={d === value} onClick={() => onChange(d)}
              aria-label={`${formatLongDate(d)}: ${{ out: 'ada di luar batas', missed: 'ada yang terlewat', recorded: 'lengkap', pending: 'belum lengkap' }[st]}`}
              className={cn('flex w-12 shrink-0 snap-center flex-col items-center gap-0.5 rounded-xl py-1.5',
                d === value ? 'bg-brand text-white' : 'border border-line bg-white text-ink')}>
              <span className={cn('text-[11px] font-semibold', d === value ? 'text-on-brand-muted' : 'text-muted')}>{d === today ? 'Hari ini' : wd(d)}</span>
              <span className="text-base leading-tight font-extrabold">{Number(d.slice(8))}</span>
              <span className={cn('size-1.5 rounded-full', DOT[st], d === value && st === 'pending' && 'bg-on-brand-muted')} />
            </button>
          );
        })}
      </div>
      <label className="relative flex w-12 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-line bg-white text-brand">
        <CalendarDays size={18} aria-hidden="true" />
        <span className="text-[11px] font-semibold">Kalender</span>
        <input type="date" max={to} value={value} onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="Pilih tanggal lain" className="absolute inset-0 opacity-0" />
      </label>
    </div>
  );
}

/** Log per tanggal: setiap indikator dengan baris Pagi / Sore / Malam. */
function DayLog({ targets, readings, date, now }) {
  return (
    <div className="flex flex-col gap-2.5">
      {targets.map((t) => {
        const ind = t.indicator;
        return (
          <Card key={t.id} className="flex flex-col px-3.5 py-2.5">
            <div className="flex items-baseline justify-between gap-2 pb-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-bold">{ind.name}</span>
                {t.where && <span className="truncate text-xs text-muted">{t.where}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">Normal {rangeText(ind)} {ind.unit}</span>
            </div>
            {SHIFTS.map((s) => {
              const r = readings.find((x) => x.target_id === t.id && x.reading_date === date && x.shift === s);
              const st = slotStatus({ date, shift: s, reading: r, indicator: ind, now });
              if (st === 'none') return null;
              return (
                <div key={s} className="flex flex-col gap-0.5 border-t border-line py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-14 text-[13px] font-semibold text-muted">{SHIFT_LABEL[s]}</span>
                    {r ? (
                      <span className={cn('tnum text-lg leading-tight font-extrabold', r.is_out_of_range ? 'text-bad' : 'text-ink')}>
                        {formatValue(r.value, ind.decimals)} <span className="text-sm font-semibold text-muted">{ind.unit}</span>
                      </span>
                    ) : <span className="text-lg leading-tight font-extrabold text-subtle">—</span>}
                    <span className="ml-auto flex items-center gap-1.5">
                      {r && <span className="text-xs text-subtle">{r.initials}{r.is_backdated ? ' · susulan' : ''}</span>}
                      <Badge tone={SLOT[st].tone}>{SLOT[st].label}</Badge>
                    </span>
                  </div>
                  {r?.is_out_of_range && r.corrective_action && (
                    <p className="ml-16 rounded-lg bg-bad-soft px-2.5 py-1.5 text-xs text-ink-soft"><b className="text-bad-strong">Tindakan:</b> {r.corrective_action}</p>
                  )}
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}

function WeekChart({ targets, readings, date }) {
  const [id, setId] = useState(targets[0]?.id);
  const t = targets.find((x) => x.id === id) ?? targets[0];
  const from = addDays(date, -6);
  const mine = readings.filter((r) => r.target_id === t.id && r.reading_date >= from && r.reading_date <= date);
  return (
    <Card className="flex flex-col gap-3 p-3.5">
      <h2 className="text-sm font-bold">Grafik 7 hari · s/d {formatShortDate(date)}</h2>
      {targets.length > 1 && (
        <div className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5 [scrollbar-width:none]">
          {targets.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === t.id} onClick={() => setId(x.id)}
              className={cn('h-8 shrink-0 rounded-full px-3 text-xs font-semibold', x.id === t.id ? 'bg-brand text-white' : 'border border-field text-muted')}>
              {x.indicator.name}{x.where ? ` · ${x.where}` : ''}
            </button>
          ))}
        </div>
      )}
      <IndicatorChart readings={mine} from={from} to={date} indicator={t.indicator} />
    </Card>
  );
}

function EquipmentList({ equipment, statuses }) {
  const today = todayWib();
  if (!equipment.length) return <Card className="p-4 text-sm text-muted">Belum ada alat di ruangan ini.</Card>;
  return (
    <div className="flex flex-col gap-2">
      {equipment.map((e) => {
        const mine = statuses.filter((s) => s.equipment_id === e.id).map((s) => dueStatus(s, today).key);
        const late = mine.filter((k) => k === 'late').length;
        const due = mine.filter((k) => k === 'today').length;
        const done = mine.filter((k) => k === 'done').length;
        return (
          <Link key={e.id} to={`/alat/${e.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-white px-3.5 py-2.5 hover:border-field">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-bold">{e.name}</span>
              <span className="truncate text-xs text-muted">{e.type?.name ?? e.category ?? 'Tanpa jenis'}</span>
            </span>
            {late > 0 ? <Badge tone="bad">{late} terlambat</Badge> : due > 0 ? <Badge tone="warn">{due} jatuh tempo</Badge> : mine.length ? <Badge tone="ok">{done ? `${done} selesai` : 'Sesuai jadwal'}</Badge> : <Badge>Tanpa kegiatan</Badge>}
            <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
          </Link>
        );
      })}
    </div>
  );
}

/* ----------------------------- DESKTOP ----------------------------- */

function RoomDesktop({ data }) {
  const now = currentShift();
  const [ym, setYm] = useState(now.date.slice(0, 7));
  const [id, setId] = useState(data.targets[0]?.id);
  const t = data.targets.find((x) => x.id === id) ?? data.targets[0];
  const days = monthDays(ym);
  const readings = useReadings(data.targets.map((x) => x.id), days[0], days.at(-1));
  const mine = (readings.data ?? []).filter((r) => r.target_id === t?.id);
  const shiftMonth = (n) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
    if (d <= now.date.slice(0, 7)) setYm(d);
  };

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {!t ? <Card className="p-5 text-sm text-muted">Ruangan ini belum punya indikator. Admin dapat memasangnya di Kelola Master → Indikator.</Card> : (
          <>
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pilih indikator">
                  {data.targets.map((x) => (
                    <button key={x.id} type="button" aria-pressed={x.id === t.id} onClick={() => setId(x.id)}
                      className={cn('h-9 rounded-full px-3.5 text-[13px] font-semibold', x.id === t.id ? 'bg-brand text-white' : 'border border-field bg-white text-muted hover:text-ink')}>
                      {x.indicator.name}{x.where ? ` · ${x.where}` : ''}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => shiftMonth(-1)} aria-label="Bulan sebelumnya" className="flex size-9 items-center justify-center rounded-lg border border-line hover:bg-ground"><ChevronLeft size={17} aria-hidden="true" /></button>
                  <span className="w-36 text-center text-sm font-bold">{monthLabel(ym)}</span>
                  <button type="button" onClick={() => shiftMonth(1)} disabled={ym >= now.date.slice(0, 7)} aria-label="Bulan berikutnya" className="flex size-9 items-center justify-center rounded-lg border border-line hover:bg-ground disabled:opacity-40"><ChevronRight size={17} aria-hidden="true" /></button>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <h2 className="text-base font-bold">Pemantauan {t.indicator.name}{t.where ? ` · ${t.where}` : ''}</h2>
                <p className="text-xs text-muted">Normal {rangeText(t.indicator)} {t.indicator.unit} · dicatat {t.indicator.shifts.map((s) => SHIFT_LABEL[s].toLowerCase()).join(', ')}</p>
              </div>
              {readings.error && <Alert>{friendlyError(readings.error)}</Alert>}
              {readings.isPending ? <div className="flex justify-center py-16"><Spinner /></div>
                : <MonitoringChart indicator={t.indicator} readings={mine} days={days} now={now} />}
              {t.indicator.notes && (
                <div className="rounded-xl bg-ground px-3.5 py-2.5 text-[13px] whitespace-pre-line text-ink-soft"><b className="text-ink">Keterangan:</b> {t.indicator.notes}</div>
              )}
              <div className="flex flex-wrap gap-2">
                <Link to={`/indikator?lok=${t.lok}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong"><PencilLine size={16} aria-hidden="true" /> Catat indikator</Link>
                <Link to={`/laporan?jenis=indikator&lok=${t.lok}&bulan=${ym}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-field bg-white px-4 text-sm font-bold text-brand hover:bg-brand-soft"><Printer size={16} aria-hidden="true" /> Cetak formulir A4</Link>
              </div>
            </Card>
            {readings.data && <LogTable target={t} readings={mine} days={days} now={now} />}
          </>
        )}
      </div>
      <aside className="flex flex-col gap-3">
        <h2 className="text-base font-bold">Alat di ruangan ini</h2>
        <EquipmentList equipment={data.equipment} statuses={data.statuses} />
      </aside>
    </div>
  );
}

function LogTable({ target, readings, days, now }) {
  const ind = target.indicator;
  const shown = days.filter((d) => d <= now.date).reverse();
  const outs = readings.filter((r) => r.is_out_of_range).sort((a, b) => b.reading_date.localeCompare(a.reading_date));
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-base font-bold">Log pencatatan</h2>
      {shown.length === 0 ? <p className="text-sm text-muted">Bulan ini belum dimulai.</p> : (
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs text-subtle">
                <th className="py-2 pr-2 font-semibold">Tanggal</th>
                {SHIFTS.map((s) => <th key={s} className="py-2 pr-2 font-semibold">{SHIFT_LABEL[s]}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d} className="border-t border-line">
                  <td className="py-2 pr-2 font-semibold whitespace-nowrap">{formatShortDate(d)}</td>
                  {SHIFTS.map((s) => {
                    const r = readings.find((x) => x.reading_date === d && x.shift === s);
                    const st = slotStatus({ date: d, shift: s, reading: r, indicator: ind, now });
                    return (
                      <td key={s} className="py-2 pr-2">
                        {r ? (
                          <span className="flex items-baseline gap-1.5">
                            <b className={cn('tnum', r.is_out_of_range ? 'text-bad' : 'text-ink')}>{formatValue(r.value, ind.decimals)} {ind.unit}</b>
                            <span className="text-xs text-subtle">{r.initials}{r.is_backdated ? '*' : ''}</span>
                          </span>
                        ) : st === 'none' ? <span className="text-subtle">·</span> : <Badge tone={SLOT[st].tone}>{SLOT[st].label}</Badge>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {outs.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <span className="text-[13px] font-bold text-bad">Di luar batas &amp; tindakan korektif ({outs.length})</span>
          {outs.map((r) => (
            <p key={r.id} className="text-[13px] text-ink-soft">
              <b>{formatShortDate(r.reading_date)} {SHIFT_LABEL[r.shift].toLowerCase()} · {formatValue(r.value, ind.decimals)} {ind.unit}</b> ({r.initials}) — {r.corrective_action}
            </p>
          ))}
        </div>
      )}
      <p className="text-xs text-subtle">* diisi susulan</p>
    </Card>
  );
}
