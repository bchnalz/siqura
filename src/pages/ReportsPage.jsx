import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Printer } from 'lucide-react';
import { useRoomsWithEquipment } from '@/features/master/api';
import { rows } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { currentShift, SHIFT_LABEL, todayWib } from '@/lib/dates';
import MonitoringChart from '@/components/MonitoringChart';
import { friendlyError, supabase } from '@/lib/supabase';
import { APP } from '@/config';
import { Alert, Button, Card, Field, Spinner, BlurLoading } from '@/components/ui';
import { cn } from '@/lib/cn';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function monthInfo(ym) {
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, n, from: `${ym}-01`, to: `${ym}-${String(n).padStart(2, '0')}`, label: `${MONTHS[m - 1]} ${y}`,
    days: Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`) };
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('jenis') || 'ceklis';
  const [ym, setYm] = useState(params.get('bulan') || todayWib().slice(0, 7));
  const rooms = useRoomsWithEquipment();

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 lg:p-0 print:p-0">
      {/* Ukuran kertas untuk cetak */}
      <style>{'@media print { @page { size: A4 landscape; margin: 10mm; } }'}</style>
      <div className="flex flex-col gap-3 pt-2 print:hidden">
        <h1 className="text-xl font-extrabold lg:text-2xl">Laporan &amp; Cetak</h1>
        <div role="tablist" className="flex gap-1 border-b border-line">
          {[['ceklis', 'Ceklis alat'], ['indikator', 'Indikator']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={kind === id} onClick={() => setParams({ jenis: id }, { replace: true })}
              className={cn('h-11 border-b-[3px] px-3 text-sm', kind === id ? 'border-brand font-bold text-brand' : 'border-transparent font-semibold text-subtle')}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {rooms.error && <Alert>{friendlyError(rooms.error)}</Alert>}
      {rooms.isPending ? <BlurLoading /> : (
        kind === 'ceklis'
          ? <ChecklistReport rooms={rooms.data} ym={ym} setYm={setYm} />
          : <IndicatorReport rooms={rooms.data} ym={ym} setYm={setYm} initialLoc={params.get('lok')} />
      )}
    </div>
  );
}

function MonthField({ ym, setYm }) {
  return (
    <Field label="Bulan" className="col-span-2 min-w-0 sm:w-auto">
      <input type="month" value={ym} max={todayWib().slice(0, 7)} onChange={(e) => e.target.value && setYm(e.target.value)}
        className="h-11 w-full min-w-0 rounded-xl border border-field bg-white px-3 text-sm font-semibold sm:w-auto" />
    </Field>
  );
}

function Kop({ title, lines }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 border-b-2 border-ink pb-2">
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase">{APP.government}</p>
          <p className="text-[15px] font-extrabold uppercase">{APP.institution}</p>
          <p className="text-xs">{APP.unit}</p>
        </div>
        <p className="text-right text-xs text-muted">Dicetak dari {APP.name}<br />{new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })}</p>
      </div>
      <h2 className="text-center text-[15px] font-extrabold text-balance uppercase">{title}</h2>
      <dl className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {lines.map(([k, v], i) => <Fragment key={i}><dt className="text-muted">{k}</dt><dd className="font-bold">{v}</dd></Fragment>)}
      </dl>
    </header>
  );
}

function Signatures({ left, right }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-10 text-center text-xs break-inside-avoid">
      {[left, right].map((t) => (
        <div key={t} className="flex flex-col items-center gap-14">
          <span>{t}</span>
          <span className="w-56 border-t border-ink pt-1 text-muted">Nama &amp; tanda tangan</span>
        </div>
      ))}
    </div>
  );
}

function Sheet({ children }) {
  return (
    <>
    <p className="text-xs text-muted lg:hidden print:hidden">Pratinjau formulir A4. Geser ke samping untuk melihat semua tanggal; hasil cetak dan CSV tetap lengkap.</p>
    <div className="max-w-full min-w-0 overflow-x-auto rounded-2xl border border-line bg-white print:overflow-visible print:rounded-none print:border-0">
      <div className="flex min-w-[960px] flex-col gap-3 p-6 text-ink print:min-w-0 print:p-0">{children}</div>
    </div>
    </>
  );
}

/* ---------------------------- CEKLIS ALAT ---------------------------- */

function ChecklistReport({ rooms, ym, setYm }) {
  const all = rooms.flatMap((r) => r.equipment.map((e) => ({ ...e, roomName: r.name })));
  const [eqId, setEqId] = useState(all[0]?.id);
  const eq = all.find((e) => e.id === eqId) ?? all[0];
  const mi = monthInfo(ym);
  const q = useQuery({
    queryKey: ['live', 'report-checks', eq?.id, ym],
    enabled: Boolean(eq),
    queryFn: async () => {
      const [acts, checks] = await Promise.all([
        rows(supabase.from('activities').select('id,name,interval_days,sort_order,is_active').eq('equipment_id', eq.id).order('sort_order')),
        rows(supabase.from('checks').select('activity_id,check_date,status,initials,is_backdated').eq('equipment_id', eq.id).gte('check_date', mi.from).lte('check_date', mi.to)),
      ]);
      const used = new Set(checks.map((c) => c.activity_id));
      return { acts: acts.filter((a) => a.is_active || used.has(a.id)), checks };
    },
  });
  const grid = useMemo(() => new Map((q.data?.checks ?? []).map((c) => [`${c.activity_id}|${c.check_date}`, c])), [q.data]);
  if (!eq) return <Card className="p-4 text-sm text-muted">Belum ada alat.</Card>;
  const paraf = mi.days.map((d) => [...new Set((q.data?.checks ?? []).filter((c) => c.check_date === d).map((c) => c.initials))].filter(Boolean));
  const mark = (c) => (c ? (c.status === 'done' ? '✓' : '–') : '');

  function csv() {
    const head = ['Kegiatan', 'Interval (hari)', ...mi.days.map((d) => Number(d.slice(8)))];
    const body = q.data.acts.map((a) => [a.name, a.interval_days, ...mi.days.map((d) => mark(grid.get(`${a.id}|${d}`)))]);
    downloadCsv(`Ceklis-${eq.name}-${ym}.csv`, [head, ...body, ['Paraf', '', ...paraf.map((p) => p.join('/'))]]);
  }

  return (
    <>
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap print:hidden">
        <Field label="Alat" className="col-span-2 min-w-0 sm:w-auto">
          <select value={eq.id} onChange={(e) => setEqId(e.target.value)} className="h-11 w-full min-w-0 truncate rounded-xl border border-field bg-white px-3 text-sm font-semibold sm:w-auto sm:max-w-[420px]">
            {rooms.map((r) => <optgroup key={r.id} label={r.name}>{r.equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>)}
          </select>
        </Field>
        <MonthField ym={ym} setYm={setYm} />
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
          <Button variant="outline" onClick={csv} disabled={!q.data}><FileDown size={17} aria-hidden="true" /> CSV</Button>
          <Button onClick={() => window.print()} disabled={!q.data}><Printer size={17} aria-hidden="true" /> Cetak A4</Button>
        </div>
      </div>
      {q.error && <Alert>{friendlyError(q.error)}</Alert>}
      {q.isPending ? <BlurLoading /> : (
        <Sheet>
          <Kop title="Formulir Pemeliharaan Alat Laboratorium" lines={[['Ruangan', eq.roomName], ['Bulan', mi.label], ['Alat', eq.name], ['Kategori', eq.category || '–']]} />
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="border border-ink/60 px-1.5 py-1 text-left">No</th>
                <th className="border border-ink/60 px-1.5 py-1 text-left">Kegiatan</th>
                <th className="border border-ink/60 px-1 py-1">Hari</th>
                {mi.days.map((d) => <th key={d} className="w-[22px] border border-ink/60 px-0 py-1 text-center">{Number(d.slice(8))}</th>)}
              </tr>
            </thead>
            <tbody>
              {q.data.acts.map((a, i) => (
                <tr key={a.id} className="break-inside-avoid">
                  <td className="border border-ink/60 px-1.5 py-1 text-center">{i + 1}</td>
                  <td className="border border-ink/60 px-1.5 py-1 leading-snug">{a.name}{!a.is_active && <span className="text-muted"> (nonaktif)</span>}</td>
                  <td className="border border-ink/60 px-1 py-1 text-center">{a.interval_days}</td>
                  {mi.days.map((d) => {
                    const c = grid.get(`${a.id}|${d}`);
                    return <td key={d} className={cn('border border-ink/60 p-0 text-center font-bold', c?.status === 'na' && 'text-muted')}>{mark(c)}{c?.is_backdated ? '*' : ''}</td>;
                  })}
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="border border-ink/60 px-1.5 py-1 text-right font-bold">Paraf</td>
                {paraf.map((p, i) => (
                  <td key={i} className="border border-ink/60 p-0 text-center align-top text-[11px] leading-tight font-semibold">
                    {p.map((x) => <span key={x} className="block">{x}</span>)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-muted">Keterangan: ✓ = selesai · – = alat tidak digunakan/libur · * = diisi susulan · Hari = interval kegiatan dalam hari.</p>
          <Signatures left={APP.signLeft} right={APP.signRight} />
        </Sheet>
      )}
    </>
  );
}

/* ----------------------------- INDIKATOR ----------------------------- */

function IndicatorReport({ rooms, ym, setYm, initialLoc }) {
  const mi = monthInfo(ym);
  const targetsQ = useQuery({
    queryKey: ['master', 'report-targets'],
    queryFn: () => rows(supabase.from('indicator_targets')
      .select('id,room_id,equipment_id,is_active,indicator:indicators!inner(id,name,unit,min_value,max_value,decimals,shifts,notes)')),
  });
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const eqLabel = new Map(rooms.flatMap((r) => r.equipment.map((e) => [e.id, `${e.name} · ${r.name}`])));
  const locs = useMemo(() => {
    const m = new Map();
    for (const t of targetsQ.data ?? []) {
      const key = t.room_id ? `r:${t.room_id}` : `e:${t.equipment_id}`;
      const label = t.room_id ? roomName.get(t.room_id) : eqLabel.get(t.equipment_id);
      if (!label) continue;
      if (!m.has(key)) m.set(key, { key, label, targets: [] });
      m.get(key).targets.push(t);
    }
    return [...m.values()];
  }, [targetsQ.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [locKey, setLocKey] = useState(initialLoc);
  const loc = locs.find((l) => l.key === locKey) ?? locs[0];

  const q = useQuery({
    queryKey: ['live', 'report-readings', loc?.key, ym],
    enabled: Boolean(loc),
    queryFn: () => rows(supabase.from('indicator_readings')
      .select('target_id,reading_date,shift,value,is_out_of_range,corrective_action,initials,is_backdated')
      .in('target_id', loc.targets.map((t) => t.id)).gte('reading_date', mi.from).lte('reading_date', mi.to)),
  });

  if (targetsQ.isPending) return <BlurLoading />;
  if (!loc) return <Card className="p-4 text-sm text-muted">Belum ada indikator yang dipasang.</Card>;

  const cols = loc.targets.flatMap((t) => t.indicator.shifts.map((s) => ({ t, s })));
  const byKey = new Map((q.data ?? []).map((r) => [`${r.target_id}|${r.reading_date}|${r.shift}`, r]));
  const outs = (q.data ?? []).filter((r) => r.is_out_of_range).sort((a, b) => (a.reading_date + a.shift).localeCompare(b.reading_date + b.shift));
  const tById = new Map(loc.targets.map((t) => [t.id, t]));
  const range = (i) => [i.min_value, i.max_value].map((v) => (v === null ? '…' : Number(v).toLocaleString('id-ID'))).join(' s/d ');

  function csv() {
    const head = ['Tanggal', ...cols.map(({ t, s }) => `${t.indicator.name} (${t.indicator.unit}) ${SHIFT_LABEL[s]}`)];
    const body = mi.days.map((d) => [d, ...cols.map(({ t, s }) => { const r = byKey.get(`${t.id}|${d}|${s}`); return r ? r.value : ''; })]);
    const notes = outs.map((r) => [r.reading_date, `${tById.get(r.target_id)?.indicator.name} ${SHIFT_LABEL[r.shift]} = ${r.value}`, r.corrective_action, r.initials]);
    downloadCsv(`Indikator-${loc.label}-${ym}.csv`, [head, ...body, [], ['Di luar batas', 'Nilai', 'Tindakan korektif', 'Paraf'], ...notes]);
  }

  return (
    <>
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap print:hidden">
        <Field label="Lokasi" className="col-span-2 min-w-0 sm:w-auto">
          <select value={loc.key} onChange={(e) => setLocKey(e.target.value)} className="h-11 w-full min-w-0 truncate rounded-xl border border-field bg-white px-3 text-sm font-semibold sm:w-auto sm:max-w-[420px]">
            {locs.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </Field>
        <MonthField ym={ym} setYm={setYm} />
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
          <Button variant="outline" onClick={csv} disabled={!q.data}><FileDown size={17} aria-hidden="true" /> CSV</Button>
          <Button onClick={() => window.print()} disabled={!q.data}><Printer size={17} aria-hidden="true" /> Cetak A4</Button>
        </div>
      </div>
      {q.error && <Alert>{friendlyError(q.error)}</Alert>}
      {q.isPending ? <BlurLoading /> : loc.targets.map((t, k) => {
        const mine = (q.data ?? []).filter((r) => r.target_id === t.id);
        const myOuts = outs.filter((r) => r.target_id === t.id);
        return (
          <div key={t.id} className={cn(k < loc.targets.length - 1 && 'print:break-after-page')}>
            <Sheet>
              <Kop title={`Formulir Pemantauan ${t.indicator.name}`} lines={[['Lokasi', loc.label], ['Bulan', mi.label],
                ['Batas normal', `${range(t.indicator)} ${t.indicator.unit}`], ['Waktu catat', t.indicator.shifts.map((s) => SHIFT_LABEL[s]).join(', ')]]} />
              <MonitoringChart indicator={t.indicator} readings={mine} days={mi.days} now={currentShift()} />
              <div className="grid grid-cols-2 gap-6 text-xs break-inside-avoid">
                <div className="flex flex-col gap-1">
                  <p className="font-bold">Keterangan</p>
                  <p className="whitespace-pre-line text-ink-soft">{t.indicator.notes || `Nilai normal ${range(t.indicator)} ${t.indicator.unit}. Nilai di luar batas wajib disertai tindakan korektif.`}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="font-bold">Nilai di luar batas &amp; tindakan korektif ({myOuts.length})</p>
                  {myOuts.length === 0 ? <p className="text-muted">Tidak ada. Semua nilai dalam batas normal.</p> : myOuts.map((r) => (
                    <p key={r.reading_date + r.shift}>
                      {Number(r.reading_date.slice(8))} {MONTHS[mi.m - 1].slice(0, 3)}, {SHIFT_LABEL[r.shift].toLowerCase()} · {Number(r.value).toLocaleString('id-ID')} {t.indicator.unit} ({r.initials}): {r.corrective_action}
                    </p>
                  ))}
                </div>
              </div>
              <Signatures left={APP.signLeft} right={APP.signRight} />
            </Sheet>
          </div>
        );
      })}
    </>
  );
}
