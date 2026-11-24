import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, History, LineChart, Pencil, RotateCcw, Undo2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeRefresh } from '@/hooks/useRealtime';
import { useActivityStatus, useAudit, useChecks, useEquipment } from '@/features/equipment/api';
import { dueStatus, formatShortDate, intervalLabel, todayWib } from '@/lib/dates';
import { runOrQueue } from '@/lib/outbox';
import { friendlyError, supabase } from '@/lib/supabase';
import { Alert, Badge, Button, Card, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const TABS = [
  { id: 'ceklis', label: 'Ceklis' },
  { id: 'matriks', label: 'Matriks' },
  { id: 'riwayat', label: 'Riwayat' },
];
const statusTone = { done: 'ok', late: 'bad', today: 'warn', soon: 'muted', later: 'muted' };

export default function EquipmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'ceklis';
  const eq = useEquipment(id);
  const statuses = useActivityStatus(id);
  useRealtimeRefresh();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-line bg-white px-3 pt-3 lg:static lg:rounded-2xl lg:border lg:px-4">
        <div className="flex items-center gap-2">
          <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Kembali"
            className="flex size-11 items-center justify-center rounded-xl hover:bg-ground">
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate text-lg font-extrabold">{eq.data?.name ?? '…'}</h1>
            <p className="truncate text-xs text-muted">
              {[eq.data?.room?.name, eq.data?.category].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div role="tablist" className="grid grid-cols-3">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id}
              onClick={() => setParams(t.id === 'ceklis' ? {} : { tab: t.id }, { replace: true })}
              className={cn('h-11 border-b-[3px] text-sm', tab === t.id ? 'border-brand font-bold text-brand' : 'border-transparent font-semibold text-subtle')}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <EquipmentIndicatorsLink equipmentId={id} />
      {eq.error && <Alert className="m-4">{friendlyError(eq.error)}</Alert>}
      {(eq.isPending || statuses.isPending) && <div className="flex justify-center py-10"><Spinner /></div>}
      {eq.data && statuses.data && (
        <>
          {tab === 'ceklis' && <ChecklistTab equipment={eq.data} statuses={statuses.data} />}
          {tab === 'matriks' && <MatrixTab equipment={eq.data} statuses={statuses.data} />}
          {tab === 'riwayat' && <HistoryTab equipmentId={id} statuses={statuses.data} />}
        </>
      )}
    </div>
  );
}

/** Alat yang juga punya indikator (mis. suhu kulkas): satu QR alat cukup untuk keduanya. */
function EquipmentIndicatorsLink({ equipmentId }) {
  const q = useQuery({
    queryKey: ['master', 'equipment-indicators', equipmentId],
    queryFn: async () => {
      const { data, error } = await supabase.from('indicator_targets')
        .select('id,indicator:indicators!inner(name,is_active)').eq('equipment_id', equipmentId).eq('is_active', true).eq('indicator.is_active', true);
      if (error) throw error;
      return data;
    },
  });
  if (!q.data?.length) return null;
  return (
    <Link to={`/indikator?lok=e:${equipmentId}`}
      className="mx-4 mt-3 flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-white px-3.5 py-2.5 lg:mx-0">
      <LineChart size={18} className="shrink-0 text-brand" aria-hidden="true" />
      <span className="flex flex-1 flex-col">
        <span className="text-sm font-bold">Catat indikator alat ini</span>
        <span className="text-xs text-muted">{q.data.map((t) => t.indicator.name).join(' · ')}</span>
      </span>
      <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
    </Link>
  );
}

/* ------------------------------ CEKLIS ------------------------------ */

function ChecklistTab({ equipment, statuses }) {
  const today = todayWib();
  const [date, setDate] = useState(today);
  const checks = useChecks(equipment.id, date, date);

  if (statuses.length === 0) {
    return <Card className="m-4 p-4 text-sm text-muted">Belum ada daftar kegiatan untuk alat ini. Admin dapat menambahkannya di Kelola Master.</Card>;
  }
  if (checks.isPending) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (checks.error) return <Alert className="m-4">{friendlyError(checks.error)}</Alert>;

  const initial = Object.fromEntries(checks.data.map((c) => [c.activity_id, c.status]));
  const version = checks.data.map((c) => c.activity_id + c.status).sort().join('|');
  return (
    <ChecklistForm key={date + version} equipment={equipment} statuses={statuses}
      date={date} setDate={setDate} today={today} initial={initial} />
  );
}

function ChecklistForm({ equipment, statuses, date, setDate, today, initial }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [sel, setSel] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const idle = statuses.length > 0 && statuses.every((s) => sel[s.activity_id] === 'na');
  const doneCount = statuses.filter((s) => sel[s.activity_id] === 'done').length;
  const changed = statuses.filter((s) => (sel[s.activity_id] ?? null) !== (initial[s.activity_id] ?? null));

  const toggle = (aid) => setSel((p) => ({ ...p, [aid]: p[aid] === 'done' ? null : 'done' }));
  const setIdle = (on) => setSel(on ? Object.fromEntries(statuses.map((s) => [s.activity_id, 'na'])) : {});
  const checkDue = () => setSel((p) => {
    const n = Object.fromEntries(Object.entries(p).filter(([, v]) => v === 'done'));
    for (const s of statuses) {
      const k = dueStatus(s, today).key;
      if (k === 'today' || k === 'late' || (date !== today && s.interval_days === 1)) n[s.activity_id] = 'done';
    }
    return n;
  });

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const items = changed.map((s) => ({ activity_id: s.activity_id, status: sel[s.activity_id] ?? null }));
      const { data, queued } = await runOrQueue({ kind: 'rpc', fn: 'save_day_checks', args: { p_equipment: equipment.id, p_date: date, p_items: items } });
      if (queued) setMsg({ tone: 'warn', text: 'Sinyal terputus. Ceklis disimpan di HP dan dikirim otomatis saat online.' });
      else {
        setMsg(data?.blocked
          ? { tone: 'warn', text: `Tersimpan. ${data.blocked} isian milik petugas lain tidak bisa dikosongkan.` }
          : { tone: 'ok', text: 'Ceklis tersimpan.' });
        await qc.invalidateQueries({ queryKey: ['live'] });
      }
    } catch (e) {
      setMsg({ tone: 'bad', text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 p-4 pb-28 lg:px-0 lg:pb-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5 rounded-xl border border-line bg-white px-3 py-2">
            <span className="text-xs text-muted">Tanggal pelaksanaan</span>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="bg-transparent text-sm font-bold outline-none" />
          </label>
          <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-white px-3 py-2">
            <span className="text-xs text-muted">Paraf (otomatis)</span>
            <span className="truncate text-sm font-bold">{profile?.initials || '—'} · {(profile?.full_name || '').split(' ')[0]}</span>
          </div>
        </div>
        {date !== today && (
          <Alert tone="warn">Isi susulan untuk {formatShortDate(date)}. Waktu input asli tetap tercatat.</Alert>
        )}

        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-white px-3.5">
          <input type="checkbox" checked={idle} onChange={(e) => setIdle(e.target.checked)} className="size-5 accent-brand" />
          <span className="flex-1 text-sm font-semibold">Alat tidak digunakan / libur</span>
          <span className="text-xs text-muted">tanda –</span>
        </label>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">{idle ? 'Ditandai: tidak digunakan' : `${doneCount} dari ${statuses.length} dicentang`}</span>
          <Button variant="outline" size="sm" onClick={checkDue}>Centang yang jatuh tempo</Button>
        </div>

        {statuses.map((s) => {
          const st = dueStatus(s, today);
          const checked = sel[s.activity_id] === 'done';
          return (
            <label key={s.activity_id}
              className={cn('flex items-start gap-3 rounded-2xl border bg-white px-3.5 py-3',
                st.key === 'late' && !checked ? 'border-bad-line' : 'border-line')}>
              <input type="checkbox" checked={checked} onChange={() => toggle(s.activity_id)} className="mt-0.5 size-[22px] shrink-0 accent-brand" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="text-sm leading-snug font-semibold">{s.name}</span>
                <span className="flex flex-wrap gap-1.5">
                  <Badge tone="brand">{intervalLabel(s.interval_days)}</Badge>
                  {checked && date === today ? <Badge tone="ok">Selesai</Badge> : <Badge tone={statusTone[st.key]}>{st.label}</Badge>}
                  {sel[s.activity_id] === 'na' && <Badge>– tidak digunakan</Badge>}
                </span>
                <span className="text-xs text-subtle">
                  {s.last_done ? `Terakhir dikerjakan ${formatShortDate(s.last_done)}` : 'Belum pernah dikerjakan'}
                  {st.key !== 'late' && st.key !== 'today' && ` · jatuh tempo ${formatShortDate(s.next_due)}`}
                </span>
              </span>
            </label>
          );
        })}

        {(equipment.sop_note || equipment.type?.sop_note || equipment.room?.sop_note) && (
          <div className="rounded-xl bg-brand-soft px-3.5 py-3">
            <p className="text-xs font-bold text-brand">Catatan SOP</p>
            <p className="text-xs leading-relaxed whitespace-pre-line text-ink-soft">{equipment.sop_note || equipment.type?.sop_note || equipment.room.sop_note}</p>
          </div>
        )}
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg flex-col gap-2 border-t border-line bg-white px-4 pt-3 lg:sticky lg:bottom-4 lg:mx-0 lg:max-w-none lg:flex-row lg:items-center lg:justify-end lg:rounded-2xl lg:border lg:p-3 lg:shadow-[0_8px_24px_rgba(19,32,31,0.10)]">
        {msg && <Alert tone={msg.tone} className="lg:flex-1">{msg.text}</Alert>}
        <Button size="lg" className="lg:min-w-64" onClick={save} disabled={busy || changed.length === 0}>
          {busy ? 'Menyimpan…' : changed.length ? `Simpan ceklis ${formatShortDate(date)}` : 'Tidak ada perubahan'}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ MATRIKS ------------------------------ */

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function MatrixTab({ equipment, statuses }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const today = todayWib();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [edit, setEdit] = useState(false);
  const [last, setLast] = useState(null);
  const [err, setErr] = useState('');
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${ym}-01`;
  const to = `${ym}-${String(daysInMonth).padStart(2, '0')}`;
  const checks = useChecks(equipment.id, from, to);
  const scroller = useRef(null);
  const loaded = !checks.isPending;
  useEffect(() => {
    // geser matriks agar tanggal hari ini terlihat
    if (loaded && scroller.current && ym === today.slice(0, 7)) {
      scroller.current.scrollLeft = Math.max(0, (Number(today.slice(8)) - 4) * 32);
    }
  }, [loaded, ym, today]);

  const grid = useMemo(() => {
    const g = new Map();
    for (const c of checks.data ?? []) g.set(`${c.activity_id}|${c.check_date}`, c);
    return g;
  }, [checks.data]);
  const days = Array.from({ length: daysInMonth }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
  const initialsByDay = days.map((d) => [...new Set((checks.data ?? []).filter((c) => c.check_date === d).map((c) => c.initials).filter(Boolean))].join('/'));

  async function setCell(activityId, date, status) {
    setErr('');
    try {
      const { data, queued } = await runOrQueue({ kind: 'rpc', fn: 'save_day_checks',
        args: { p_equipment: equipment.id, p_date: date, p_items: [{ activity_id: activityId, status }] } });
      if (data?.blocked) setErr('Isian petugas lain hanya bisa dikosongkan oleh pengisinya atau admin.');
      if (queued) setErr('Offline: perubahan disimpan di HP dan dikirim saat online.');
      await qc.invalidateQueries({ queryKey: ['live'] });
    } catch (e) { setErr(friendlyError(e)); }
  }
  function cycle(activityId, date) {
    if (!edit || date > today) return;
    const cur = grid.get(`${activityId}|${date}`)?.status ?? null;
    const next = cur === null ? 'done' : cur === 'done' ? 'na' : null;
    setLast({ activityId, date, prev: cur });
    setCell(activityId, date, next);
  }
  async function resetMonth() {
    if (!window.confirm(`Hapus SEMUA ceklis ${equipment.name} bulan ${MONTHS[m - 1]} ${y}? Riwayat tetap tercatat.`)) return;
    const { error } = await supabase.rpc('reset_month', { p_equipment: equipment.id, p_year: y, p_month: m });
    if (error) setErr(friendlyError(error)); else qc.invalidateQueries({ queryKey: ['live'] });
  }

  return (
    <div className="flex flex-col gap-3 p-4 lg:px-0">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="bulan">Bulan</label>
        <input id="bulan" type="month" value={ym} max={today.slice(0, 7)} onChange={(e) => e.target.value && setYm(e.target.value)}
          className="h-11 rounded-xl border border-field bg-white px-3 text-sm font-bold" />
        <Button variant={edit ? 'primary' : 'outline'} size="sm" onClick={() => setEdit(!edit)} aria-pressed={edit}>
          <Pencil size={15} aria-hidden="true" /> {edit ? 'Mode ubah: aktif' : 'Ubah matriks'}
        </Button>
        {last && edit && (
          <Button variant="ghost" size="sm" onClick={() => { setCell(last.activityId, last.date, last.prev); setLast(null); }}>
            <Undo2 size={15} aria-hidden="true" /> Batalkan
          </Button>
        )}
      </div>
      {edit && <p className="text-xs text-muted">Ketuk sel: kosong → ✓ selesai → – tidak digunakan → kosong.</p>}
      {err && <Alert tone="warn">{err}</Alert>}
      {checks.isPending ? <div className="flex justify-center py-8"><Spinner /></div> : (
        <div ref={scroller} className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] min-w-36 bg-white px-2 py-2 text-left font-bold">Kegiatan</th>
                {days.map((d) => (
                  <th key={d} className={cn('w-8 min-w-8 px-0 py-2 text-center text-xs font-semibold', d === today ? 'text-brand' : 'text-subtle')}>{Number(d.slice(8))}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statuses.map((s) => (
                <tr key={s.activity_id} className="border-t border-line">
                  <th scope="row" className="sticky left-0 z-[1] max-w-40 bg-white px-2 py-1.5 text-left font-medium leading-snug">
                    {s.name}<span className="block text-xs font-normal text-subtle">{s.interval_days} hari</span>
                  </th>
                  {days.map((d) => {
                    const c = grid.get(`${s.activity_id}|${d}`);
                    const future = d > today;
                    return (
                      <td key={d} className="p-0.5 text-center">
                        <button type="button" disabled={!edit || future} onClick={() => cycle(s.activity_id, d)}
                          aria-label={`${s.name}, ${d}: ${c ? (c.status === 'done' ? 'selesai' : 'tidak digunakan') : 'kosong'}`}
                          title={c ? `${c.initials}${c.is_backdated ? ' · susulan' : ''}` : undefined}
                          className={cn('flex size-7 items-center justify-center rounded-md text-sm font-bold',
                            c?.status === 'done' ? 'bg-ok-soft text-ok' : c?.status === 'na' ? 'bg-ground text-subtle' : future ? 'bg-transparent' : 'bg-ground/60',
                            edit && !future && 'ring-1 ring-field')}>
                          {c?.status === 'done' ? '✓' : c?.status === 'na' ? '–' : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-line bg-ground">
                <th scope="row" className="sticky left-0 z-[1] bg-ground px-2 py-1.5 text-left font-bold">Paraf</th>
                {initialsByDay.map((t, i) => (
                  <td key={i} className="px-0 py-1.5 text-center align-top text-[11px] leading-snug font-semibold text-muted">
                    {t.split('/').filter(Boolean).map((x) => <span key={x} className="block">{x}</span>)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-subtle">✓ selesai · – tidak digunakan/libur · tahan kursor/ketuk lama pada sel untuk melihat paraf.</p>
      {isAdmin && (
        <Button variant="ghost" size="sm" className="self-start text-bad" onClick={resetMonth}>
          <RotateCcw size={15} aria-hidden="true" /> Reset ceklis bulan ini (admin)
        </Button>
      )}
    </div>
  );
}

/* ------------------------------ RIWAYAT ------------------------------ */

function describe(row, names) {
  const d = row.new_data ?? row.old_data ?? {};
  const name = names.get(d.activity_id) ?? d.name ?? 'kegiatan';
  if (row.table_name === 'checks') {
    const date = formatShortDate(d.check_date);
    if (row.action === 'DELETE') return `Mengosongkan “${name}” tgl ${date}`;
    const mark = d.status === 'done' ? '✓' : '–';
    return `${mark} “${name}” tgl ${date}${d.is_backdated ? ' (susulan)' : ''}`;
  }
  if (row.table_name === 'activities') {
    if (row.action === 'INSERT') return `Menambah kegiatan “${d.name}” (tiap ${d.interval_days} hari)`;
    if (row.action === 'DELETE') return `Menghapus kegiatan “${d.name}”`;
    return `Mengubah kegiatan “${d.name}”`;
  }
  if (row.table_name === 'equipment') return row.action === 'INSERT' ? 'Alat didaftarkan' : 'Data alat diubah';
  if (row.table_name === 'indicator_readings') return `Mencatat indikator (${d.shift}) nilai ${d.value}`;
  return `${row.table_name} ${row.action}`;
}

function HistoryTab({ equipmentId, statuses }) {
  const audit = useAudit(equipmentId);
  const names = useMemo(() => new Map(statuses.map((s) => [s.activity_id, s.name])), [statuses]);
  if (audit.isPending) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (audit.error) return <Alert className="m-4">{friendlyError(audit.error)}</Alert>;
  return (
    <div className="flex flex-col gap-2 p-4 lg:px-0">
      {audit.data.length === 0 && <Card className="p-4 text-sm text-muted">Belum ada riwayat.</Card>}
      {audit.data.map((r) => (
        <div key={r.id} className="flex gap-3 rounded-2xl border border-line bg-white px-3.5 py-2.5">
          <History size={16} className="mt-0.5 shrink-0 text-subtle" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold">{describe(r, names)}</span>
            <span className="text-xs text-subtle">
              {r.user_label ?? 'Sistem'} · {new Date(r.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      ))}
      <Link to="/" className="py-2 text-center text-[13px] font-semibold text-brand">Kembali ke Beranda</Link>
    </div>
  );
}

