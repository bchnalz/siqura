import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Layers, RotateCcw, Trash2 } from 'lucide-react';
import { useRoomsWithEquipment } from '@/features/master/api';
import { unitScope } from '@/features/master/scope';
import { parseBulk, TEMPLATES } from '@/features/master/templates';
import { must, useAction } from '@/hooks/useAction';
import { intervalLabel } from '@/lib/dates';
import { friendlyError, supabase } from '@/lib/supabase';
import { rows } from '@/lib/api';
import { Alert, Badge, Button, Card, Field, Input, Spinner, BlurLoading } from '@/components/ui';
import { cn } from '@/lib/cn';

const QUICK = [1, 7, 30, 90, 180, 365];

export default function ActivitiesTab({ initialEquipment }) {
  const rooms = useRoomsWithEquipment();
  const all = (rooms.data ?? []).flatMap((r) => r.equipment.map((e) => ({ ...e, roomName: r.name })));
  const [eqId, setEqId] = useState(initialEquipment);
  const current = all.find((e) => e.id === eqId) ?? all[0];

  if (rooms.isPending) return <BlurLoading />;
  if (rooms.error) return <Alert>{friendlyError(rooms.error)}</Alert>;
  if (!current) return <Card className="p-4 text-sm text-muted">Tambahkan ruangan & alat dulu di tab Ruangan & Alat.</Card>;

  return (
    <div className="flex flex-col gap-4">
      <Field label="Alat">
        <select value={current.id} onChange={(e) => setEqId(e.target.value)} className="h-12 rounded-xl border border-field bg-white px-3 text-[15px] font-semibold lg:max-w-md">
          {(rooms.data ?? []).map((r) => (
            <optgroup key={r.id} label={r.name}>
              {r.equipment.map((e) => <option key={e.id} value={e.id}>{e.name}{e.is_active ? '' : ' (nonaktif)'}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <ActivityList key={current.id} scope={unitScope(current)} />
        <AddActivities key={`add-${current.id}`} scope={unitScope(current)}
          sources={all.filter((e) => e.id !== current.id).map((e) => ({ id: e.id, label: `${e.name} · ${e.roomName}`, table: 'activities', fk: 'equipment_id' }))} />
      </div>
    </div>
  );
}

function useScopeActivities(scope) {
  return useQuery({
    queryKey: ['master', 'activities', scope.table, scope.id],
    queryFn: () => rows(supabase.from(scope.table)
      .select(scope.kind === 'unit' ? 'id,name,interval_days,sort_order,is_active,type_activity_id,type:type_activities(type_id,type:equipment_types(name))' : 'id,name,interval_days,sort_order,is_active')
      .eq(scope.fk, scope.id).order('sort_order').order('created_at')),
  });
}

export function ActivityList({ scope }) {
  const q = useScopeActivities(scope);
  const { run, error } = useAction();
  const [showInactive, setShowInactive] = useState(false);
  if (q.isPending) return <BlurLoading />;
  const all = q.data ?? [];
  // di unit: kegiatan dari jenis dikunci (diatur di Jenis Alat); yang bisa diubah hanya kegiatan khusus unit
  const fromType = scope.kind === 'unit' ? all.filter((a) => a.type_activity_id && a.is_active) : [];
  const active = all.filter((a) => a.is_active && !(scope.kind === 'unit' && a.type_activity_id));
  const inactive = all.filter((a) => !a.is_active);
  const typeName = fromType[0]?.type?.type?.name;

  async function move(i, dir) {
    const a = active[i], b = active[i + dir];
    if (!b) return;
    const base = fromType.length;
    await run(async () => {
      // urutan dirapikan ulang lalu dua item ditukar (kegiatan khusus unit diletakkan setelah kegiatan jenis)
      const order = active.map((x) => x.id);
      [order[i], order[i + dir]] = [order[i + dir], order[i]];
      await Promise.all(order.map((id, idx) => must(supabase.from(scope.table).update({ sort_order: base + idx + 1 }).eq('id', id))));
      return a && b;
    });
  }

  return (
    <div className="@container flex flex-col gap-2">
      <h2 className="text-sm font-bold">{fromType.length + active.length} kegiatan aktif · {scope.name}</h2>
      {scope.kind === 'type' && (
        <p className="text-xs text-muted">Berlaku untuk {scope.unitCount} unit alat jenis ini. Perubahan di sini otomatis ikut ke semua unit.</p>
      )}
      {error && <Alert>{error}</Alert>}
      {fromType.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-brand"><Layers size={14} aria-hidden="true" /> Dari jenis {typeName}</span>
            <Link to={`/master?tab=jenis&jenis=${fromType[0].type?.type_id}`} className="text-xs font-semibold text-brand underline-offset-2 hover:underline">Ubah di Jenis Alat</Link>
          </div>
          {fromType.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 border-t border-line pt-1.5 text-sm">
              <span>{a.name}</span>
              <Badge tone="brand">{intervalLabel(a.interval_days).split(' · ')[0]}</Badge>
            </div>
          ))}
        </div>
      )}
      {fromType.length > 0 && active.length > 0 && <h3 className="pt-1 text-xs font-bold text-muted">Kegiatan khusus unit ini</h3>}
      {active.length === 0 && fromType.length === 0 && <Card className="p-4 text-sm text-muted">Belum ada kegiatan. Tambahkan lewat panel “Tambah kegiatan”.</Card>}
      {active.map((a, i) => (
        <ActivityRow key={a.id + a.name + a.interval_days} a={a} scope={scope} index={i} last={i === active.length - 1} onMove={move} run={run} />
      ))}
      {inactive.length > 0 && (
        <button className="self-start text-[13px] font-semibold text-brand" onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? 'Sembunyikan' : 'Tampilkan'} {inactive.length} kegiatan nonaktif
        </button>
      )}
      {showInactive && inactive.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-field px-3 py-2 text-sm text-muted">
          <span className="flex-1">{a.name} · {a.interval_days} hari</span>
          <Button variant="ghost" size="sm" onClick={() => run(() => must(supabase.from(scope.table).update({ is_active: true, sort_order: fromType.length + active.length + 1 }).eq('id', a.id)))}>
            <RotateCcw size={15} aria-hidden="true" /> Aktifkan
          </Button>
          <InactiveDelete a={a} scope={scope} run={run} />
        </div>
      ))}
      <p className="text-xs text-muted">Kegiatan yang dinonaktifkan hilang dari ceklis, tetapi riwayat isiannya tetap tersimpan untuk laporan. Hapus permanen hanya untuk kegiatan yang salah input.</p>
    </div>
  );
}

function ActivityRow({ a, scope, index, last, onMove, run }) {
  const [name, setName] = useState(a.name);
  const [days, setDays] = useState(String(a.interval_days));
  const dirty = name.trim() !== a.name || Number(days) !== a.interval_days;
  const valid = name.trim() && Number(days) >= 1 && Number(days) <= 3650;
  const [removing, setRemoving] = useState(false);
  return (
    <Card className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 p-3 @xl:grid-cols-[20px_minmax(0,1fr)_auto_auto] @xl:items-center">
      <span className="tnum pt-3 text-right text-xs font-bold text-subtle @xl:pt-0">{index + 1}</span>
      <Input aria-label="Nama kegiatan" value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-sm font-semibold" />
      <div className="col-start-2 row-start-2 flex flex-wrap items-center gap-2 @xl:col-start-3 @xl:row-start-1">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          Tiap
          <Input aria-label="Interval hari" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} className="h-9 w-20 text-sm" />
          hari
        </label>
        <Badge tone="brand" className="@xl:hidden @3xl:inline-flex">{Number(days) >= 1 ? intervalLabel(Number(days)).split(' · ')[0] : '—'}</Badge>
      </div>
      <div className="col-start-3 row-span-2 row-start-1 flex flex-col @xl:col-start-4 @xl:row-span-1 @xl:flex-row @xl:items-center">
        <Button variant="ghost" size="sm" aria-label="Naikkan" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={15} aria-hidden="true" /></Button>
        <Button variant="ghost" size="sm" aria-label="Turunkan" disabled={last} onClick={() => onMove(index, 1)}><ArrowDown size={15} aria-hidden="true" /></Button>
        <Button variant="ghost" size="sm" aria-label={`Hapus ${a.name}`} title="Hapus" aria-expanded={removing}
          className={removing ? 'bg-bad-soft text-bad' : 'text-bad'} onClick={() => setRemoving(!removing)}>
          <Trash2 size={15} aria-hidden="true" />
        </Button>
      </div>
      {removing && <RemoveActivity a={a} scope={scope} run={run} onCancel={() => setRemoving(false)} />}
      {dirty && (
        <div className="col-span-full flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setName(a.name); setDays(String(a.interval_days)); }}>Batal</Button>
          <Button size="sm" disabled={!valid}
            onClick={() => run(() => must(supabase.from(scope.table).update({ name: name.trim(), interval_days: Number(days) }).eq('id', a.id)))}>
            Simpan perubahan
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Jumlah isian ceklis milik sebuah kegiatan (riwayat yang ikut terhapus). */
async function countChecks(activityId) {
  const { count, error } = await supabase.from('checks').select('id', { count: 'exact', head: true }).eq('activity_id', activityId);
  if (error) throw error;
  return count; // null = tidak terbaca → diperlakukan sebagai punya riwayat
}

/** Panel hapus di dalam baris: kegiatan tanpa riwayat langsung dihapus;
 *  yang sudah punya isian ditawari nonaktifkan agar laporan lama tetap utuh. */
function RemoveActivity({ a, scope, run, onCancel }) {
  if (scope.kind === 'type') return <RemoveTypeActivity a={a} scope={scope} run={run} onCancel={onCancel} />;
  return <RemoveUnitActivity a={a} run={run} onCancel={onCancel} />;
}

/** Hapus kegiatan dari Jenis Alat: aman karena server menonaktifkan (bukan menghapus)
 *  kegiatan di unit yang sudah punya isian. */
function RemoveTypeActivity({ a, scope, run, onCancel }) {
  return (
    <div role="alertdialog" aria-label={`Hapus ${a.name}`} className="col-span-full flex flex-col gap-2 rounded-xl border border-bad-line bg-bad-soft p-3">
      <p className="text-sm text-bad-strong">
        <b>Hapus “{a.name}” dari jenis {scope.name}?</b> Kegiatan ini hilang dari {scope.unitCount} unit. Unit yang sudah punya isian
        hanya dinonaktifkan, jadi riwayat dan laporan lama tetap utuh.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Batal</Button>
        <Button variant="danger" size="sm" onClick={() => run(() => must(supabase.from('type_activities').delete().eq('id', a.id)))}>
          <Trash2 size={15} aria-hidden="true" /> Hapus dari jenis
        </Button>
      </div>
    </div>
  );
}

function RemoveUnitActivity({ a, run, onCancel }) {
  const [state, setState] = useState({ loading: true, count: null });
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    countChecks(a.id).then((n) => alive && setState({ loading: false, count: n })).catch((e) => alive && setErr(friendlyError(e)));
    return () => { alive = false; };
  }, [a.id]);
  const { loading, count } = state;
  const hasHistory = !loading && count !== 0; // termasuk bila jumlahnya tidak terbaca
  const del = () => run(() => must(supabase.from('activities').delete().eq('id', a.id)));
  const deactivate = () => run(() => must(supabase.from('activities').update({ is_active: false }).eq('id', a.id)));

  return (
    <div role="alertdialog" aria-label={`Hapus ${a.name}`} className="col-span-full flex flex-col gap-2 rounded-xl border border-bad-line bg-bad-soft p-3">
      {err && <p className="text-sm text-bad">{err}</p>}
      {loading && !err && <p className="text-sm text-muted">Memeriksa riwayat…</p>}
      {!loading && count === 0 && (
        <>
          <p className="text-sm font-semibold text-bad-strong">Hapus “{a.name}”? Kegiatan ini belum punya isian ceklis.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>Batal</Button>
            <Button variant="danger" size="sm" onClick={del}><Trash2 size={15} aria-hidden="true" /> Hapus</Button>
          </div>
        </>
      )}
      {hasHistory && (
        <>
          <p className="text-sm text-bad-strong">
            <b>“{a.name}” {count ? `sudah punya ${count} isian ceklis` : 'mungkin sudah punya isian ceklis'}.</b> Menghapusnya ikut menghapus riwayat itu dari matriks dan laporan.
            Bila kegiatan sudah tidak dipakai, cukup <b>nonaktifkan</b>.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>Batal</Button>
            <Button variant="outline" size="sm" onClick={deactivate}>Nonaktifkan (riwayat tetap)</Button>
            <Button variant="danger" size="sm"
              onClick={() => window.confirm(`Hapus permanen “${a.name}” beserta ${count ?? 'semua'} isian ceklisnya? Tindakan ini tidak bisa dibatalkan.`) && del()}>
              Hapus permanen
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function InactiveDelete({ a, scope, run }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="text-bad" aria-label={`Hapus ${a.name}`} onClick={() => setOpen(!open)}><Trash2 size={15} aria-hidden="true" /></Button>
      {open && <div className="basis-full"><RemoveActivity a={a} scope={scope} run={run} onCancel={() => setOpen(false)} /></div>}
    </>
  );
}

const MODES = [
  { id: 'satu', label: 'Satu' },
  { id: 'massal', label: 'Massal' },
  { id: 'template', label: 'Template SOP' },
  { id: 'salin', label: 'Salin dari lain' },
];

export function AddActivities({ scope, sources }) {
  const { run, busy, error, setError } = useAction();
  const [mode, setMode] = useState('satu');
  const [replace, setReplace] = useState(false);
  const [one, setOne] = useState({ name: '', days: '1' });
  const [bulk, setBulk] = useState('');
  const [bulkDays, setBulkDays] = useState(1);
  const [tpl, setTpl] = useState(TEMPLATES[0].id);
  const [src, setSrc] = useState(sources[0]?.id ?? '');
  const [done, setDone] = useState('');

  async function collect() {
    if (mode === 'satu') return one.name.trim() ? [{ name: one.name.trim(), interval_days: Math.max(1, Number(one.days) || 1) }] : [];
    if (mode === 'massal') return parseBulk(bulk, bulkDays);
    if (mode === 'template') return TEMPLATES.find((t) => t.id === tpl).items.map(([name, interval_days]) => ({ name, interval_days }));
    const from = sources.find((x) => x.id === src);
    if (!from) return [];
    return rows(supabase.from(from.table).select('name,interval_days').eq(from.fk, from.id).eq('is_active', true).order('sort_order'));
  }

  async function submit(e) {
    e.preventDefault(); setDone('');
    const items = await collect().catch((err) => { setError(friendlyError(err)); return null; });
    if (!items) return;
    if (!items.length) { setError('Belum ada kegiatan untuk ditambahkan.'); return; }
    const what = scope.kind === 'type' ? `kegiatan jenis ${scope.name} (berlaku di ${scope.unitCount} unit)` : `kegiatan khusus ${scope.name}`;
    if (replace && !window.confirm(`Ganti semua ${what}? Kegiatan lama dinonaktifkan (riwayat tetap ada).`)) return;
    const ok = await run(async () => {
      if (replace) {
        let q = supabase.from(scope.table).update({ is_active: false }).eq(scope.fk, scope.id).eq('is_active', true);
        if (scope.kind === 'unit') q = q.is('type_activity_id', null); // kegiatan dari jenis tidak ikut diganti
        await must(q);
      }
      const existing = await rows(supabase.from(scope.table).select('sort_order').eq(scope.fk, scope.id).eq('is_active', true));
      const start = existing.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1;
      await must(supabase.from(scope.table).insert(items.map((it, i) => ({ ...it, [scope.fk]: scope.id, sort_order: start + i }))));
      return items.length;
    });
    if (ok) { setDone(`${ok} kegiatan ditambahkan.`); setOne({ name: '', days: one.days }); setBulk(''); }
  }

  return (
    <Card className="lg:sticky lg:top-6">
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <h2 className="text-[15px] font-extrabold">{scope.kind === 'unit' && scope.typeId ? 'Tambah kegiatan khusus unit' : 'Tambah kegiatan'}</h2>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-ground p-1 sm:grid-cols-4 lg:grid-cols-2">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}
              className={cn('h-9 rounded-lg text-xs font-bold', mode === m.id ? 'bg-white text-brand shadow-sm' : 'text-subtle')}>{m.label}</button>
          ))}
        </div>

        {mode === 'satu' && (
          <>
            <Field label="Nama kegiatan"><Input value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} placeholder="mis. Bersihkan rak dengan disinfektan" /></Field>
            <Field label="Dilakukan tiap … hari">
              <Input type="number" min={1} max={3650} value={one.days} onChange={(e) => setOne({ ...one, days: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((d) => (
                <button key={d} type="button" onClick={() => setOne({ ...one, days: String(d) })}
                  className={cn('h-8 rounded-full px-3 text-xs font-semibold', Number(one.days) === d ? 'bg-brand text-white' : 'border border-field text-muted')}>
                  {intervalLabel(d).split(' · ')[0]}
                </button>
              ))}
            </div>
          </>
        )}

        {mode === 'massal' && (
          <>
            <Field label="Satu baris satu kegiatan" hint="Interval boleh ditulis di akhir: “Bersihkan rak ; 7”. Tanpa angka → pakai interval bawaan.">
              <textarea rows={7} value={bulk} onChange={(e) => setBulk(e.target.value)} className="rounded-xl border border-field px-3 py-2 text-sm"
                placeholder={'Disinfeksi permukaan kerja\nBersihkan rak ; 7\nKalibrasi ; 365'} />
            </Field>
            <Field label="Interval bawaan">
              <select value={bulkDays} onChange={(e) => setBulkDays(Number(e.target.value))} className="h-11 rounded-xl border border-field bg-white px-3 text-sm">
                {QUICK.map((d) => <option key={d} value={d}>{intervalLabel(d)}</option>)}
              </select>
            </Field>
            {bulk.trim() && <p className="text-xs text-muted">{parseBulk(bulk, bulkDays).length} kegiatan akan ditambahkan.</p>}
          </>
        )}

        {mode === 'template' && (
          <>
            <Field label="Template">
              <select value={tpl} onChange={(e) => setTpl(e.target.value)} className="h-11 rounded-xl border border-field bg-white px-3 text-sm">
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <ul className="flex flex-col gap-1 rounded-xl bg-ground p-3 text-xs">
              {TEMPLATES.find((t) => t.id === tpl).items.map(([n, d]) => <li key={n}>• {n} <span className="text-muted">· {d} hari</span></li>)}
            </ul>
            <p className="text-xs text-muted">Template hanya titik awal. Sesuaikan dengan SOP dan manual alat setelah ditambahkan.</p>
          </>
        )}

        {mode === 'salin' && (
          sources.length === 0 ? <p className="text-sm text-muted">Belum ada sumber lain untuk disalin.</p> : (
            <Field label="Salin kegiatan aktif dari">
              <select value={src} onChange={(e) => setSrc(e.target.value)} className="h-11 rounded-xl border border-field bg-white px-3 text-sm">
                {sources.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
          )
        )}

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[13px] font-semibold">Cara menambah</legend>
          <label className="flex min-h-9 items-center gap-2 text-sm"><input type="radio" checked={!replace} onChange={() => setReplace(false)} className="accent-brand" /> Tambahkan ke daftar yang ada</label>
          <label className="flex min-h-9 items-center gap-2 text-sm"><input type="radio" checked={replace} onChange={() => setReplace(true)} className="accent-brand" /> {scope.kind === 'unit' && scope.typeId ? 'Ganti semua kegiatan khusus unit' : 'Ganti semua kegiatan'}</label>
        </fieldset>
        {error && <Alert>{error}</Alert>}
        {done && <Alert tone="ok">{done}</Alert>}
        <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Tambahkan'}</Button>
      </form>
    </Card>
  );
}
