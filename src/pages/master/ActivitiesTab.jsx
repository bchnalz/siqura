import { useState } from 'react';
import { ArrowDown, ArrowUp, EyeOff, RotateCcw } from 'lucide-react';
import { useActivities, useRoomsWithEquipment } from '@/features/master/api';
import { parseBulk, TEMPLATES } from '@/features/master/templates';
import { must, useAction } from '@/hooks/useAction';
import { intervalLabel } from '@/lib/dates';
import { friendlyError, supabase } from '@/lib/supabase';
import { rows } from '@/lib/api';
import { Alert, Badge, Button, Card, Field, Input, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const QUICK = [1, 7, 30, 90, 180, 365];

export default function ActivitiesTab({ initialEquipment }) {
  const rooms = useRoomsWithEquipment();
  const all = (rooms.data ?? []).flatMap((r) => r.equipment.map((e) => ({ ...e, roomName: r.name })));
  const [eqId, setEqId] = useState(initialEquipment);
  const current = all.find((e) => e.id === eqId) ?? all[0];

  if (rooms.isPending) return <div className="flex justify-center py-8"><Spinner /></div>;
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
        <ActivityList key={current.id} equipment={current} />
        <AddActivities key={`add-${current.id}`} equipment={current} others={all.filter((e) => e.id !== current.id)} />
      </div>
    </div>
  );
}

function ActivityList({ equipment }) {
  const q = useActivities(equipment.id);
  const { run, error } = useAction();
  const [showInactive, setShowInactive] = useState(false);
  if (q.isPending) return <div className="flex justify-center py-8"><Spinner /></div>;
  const active = q.data.filter((a) => a.is_active);
  const inactive = q.data.filter((a) => !a.is_active);

  async function move(i, dir) {
    const a = active[i], b = active[i + dir];
    if (!b) return;
    await run(async () => {
      // urutan dirapikan ulang 1..n lalu dua item ditukar
      const order = active.map((x) => x.id);
      [order[i], order[i + dir]] = [order[i + dir], order[i]];
      await Promise.all(order.map((id, idx) => must(supabase.from('activities').update({ sort_order: idx + 1 }).eq('id', id))));
      return a && b;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-bold">{active.length} kegiatan aktif · {equipment.name}</h2>
      {error && <Alert>{error}</Alert>}
      {active.length === 0 && <Card className="p-4 text-sm text-muted">Belum ada kegiatan. Tambahkan lewat panel “Tambah kegiatan”.</Card>}
      {active.map((a, i) => (
        <ActivityRow key={a.id + a.name + a.interval_days} a={a} index={i} last={i === active.length - 1} onMove={move} run={run} />
      ))}
      {inactive.length > 0 && (
        <button className="self-start text-[13px] font-semibold text-brand" onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? 'Sembunyikan' : 'Tampilkan'} {inactive.length} kegiatan nonaktif
        </button>
      )}
      {showInactive && inactive.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-xl border border-dashed border-field px-3 py-2 text-sm text-muted">
          <span className="flex-1">{a.name} · {a.interval_days} hari</span>
          <Button variant="ghost" size="sm" onClick={() => run(() => must(supabase.from('activities').update({ is_active: true, sort_order: active.length + 1 }).eq('id', a.id)))}>
            <RotateCcw size={15} aria-hidden="true" /> Aktifkan
          </Button>
        </div>
      ))}
      <p className="text-xs text-muted">Kegiatan yang dinonaktifkan hilang dari ceklis, tetapi riwayat isiannya tetap tersimpan.</p>
    </div>
  );
}

function ActivityRow({ a, index, last, onMove, run }) {
  const [name, setName] = useState(a.name);
  const [days, setDays] = useState(String(a.interval_days));
  const dirty = name.trim() !== a.name || Number(days) !== a.interval_days;
  const valid = name.trim() && Number(days) >= 1 && Number(days) <= 3650;
  return (
    <Card className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 p-3 lg:grid-cols-[20px_minmax(0,1fr)_auto_auto] lg:items-center">
      <span className="tnum pt-3 text-right text-xs font-bold text-subtle lg:pt-0">{index + 1}</span>
      <Input aria-label="Nama kegiatan" value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-sm font-semibold" />
      <div className="col-start-2 row-start-2 flex flex-wrap items-center gap-2 lg:col-start-3 lg:row-start-1">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          Tiap
          <Input aria-label="Interval hari" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} className="h-9 w-20 text-sm" />
          hari
        </label>
        <Badge tone="brand" className="lg:hidden xl:inline-flex">{Number(days) >= 1 ? intervalLabel(Number(days)).split(' · ')[0] : '—'}</Badge>
      </div>
      <div className="col-start-3 row-span-2 row-start-1 flex flex-col lg:col-start-4 lg:row-span-1 lg:flex-row lg:items-center">
        <Button variant="ghost" size="sm" aria-label="Naikkan" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={15} aria-hidden="true" /></Button>
        <Button variant="ghost" size="sm" aria-label="Turunkan" disabled={last} onClick={() => onMove(index, 1)}><ArrowDown size={15} aria-hidden="true" /></Button>
        <Button variant="ghost" size="sm" aria-label={`Nonaktifkan ${a.name}`} title="Nonaktifkan" className="text-muted"
          onClick={() => window.confirm(`Nonaktifkan “${a.name}”?`) && run(() => must(supabase.from('activities').update({ is_active: false }).eq('id', a.id)))}>
          <EyeOff size={15} aria-hidden="true" />
        </Button>
      </div>
      {dirty && (
        <div className="col-span-full flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setName(a.name); setDays(String(a.interval_days)); }}>Batal</Button>
          <Button size="sm" disabled={!valid}
            onClick={() => run(() => must(supabase.from('activities').update({ name: name.trim(), interval_days: Number(days) }).eq('id', a.id)))}>
            Simpan perubahan
          </Button>
        </div>
      )}
    </Card>
  );
}

const MODES = [
  { id: 'satu', label: 'Satu' },
  { id: 'massal', label: 'Massal' },
  { id: 'template', label: 'Template SOP' },
  { id: 'salin', label: 'Salin alat lain' },
];

function AddActivities({ equipment, others }) {
  const { run, busy, error, setError } = useAction();
  const [mode, setMode] = useState('satu');
  const [replace, setReplace] = useState(false);
  const [one, setOne] = useState({ name: '', days: '1' });
  const [bulk, setBulk] = useState('');
  const [bulkDays, setBulkDays] = useState(1);
  const [tpl, setTpl] = useState(TEMPLATES[0].id);
  const [src, setSrc] = useState(others[0]?.id ?? '');
  const [done, setDone] = useState('');

  async function collect() {
    if (mode === 'satu') return one.name.trim() ? [{ name: one.name.trim(), interval_days: Math.max(1, Number(one.days) || 1) }] : [];
    if (mode === 'massal') return parseBulk(bulk, bulkDays);
    if (mode === 'template') return TEMPLATES.find((t) => t.id === tpl).items.map(([name, interval_days]) => ({ name, interval_days }));
    const list = await rows(supabase.from('activities').select('name,interval_days').eq('equipment_id', src).eq('is_active', true).order('sort_order'));
    return list;
  }

  async function submit(e) {
    e.preventDefault(); setDone('');
    const items = await collect().catch((err) => { setError(friendlyError(err)); return null; });
    if (!items) return;
    if (!items.length) { setError('Belum ada kegiatan untuk ditambahkan.'); return; }
    if (replace && !window.confirm(`Ganti semua kegiatan ${equipment.name}? Kegiatan lama dinonaktifkan (riwayat tetap ada).`)) return;
    const ok = await run(async () => {
      if (replace) await must(supabase.from('activities').update({ is_active: false }).eq('equipment_id', equipment.id).eq('is_active', true));
      const existing = await rows(supabase.from('activities').select('sort_order').eq('equipment_id', equipment.id).eq('is_active', true));
      const start = existing.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1;
      await must(supabase.from('activities').insert(items.map((it, i) => ({ ...it, equipment_id: equipment.id, sort_order: start + i }))));
      return items.length;
    });
    if (ok) { setDone(`${ok} kegiatan ditambahkan.`); setOne({ name: '', days: one.days }); setBulk(''); }
  }

  return (
    <Card className="lg:sticky lg:top-6">
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <h2 className="text-[15px] font-extrabold">Tambah kegiatan</h2>
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
          others.length === 0 ? <p className="text-sm text-muted">Belum ada alat lain.</p> : (
            <Field label="Salin kegiatan aktif dari">
              <select value={src} onChange={(e) => setSrc(e.target.value)} className="h-11 rounded-xl border border-field bg-white px-3 text-sm">
                {others.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.roomName}</option>)}
              </select>
            </Field>
          )
        )}

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[13px] font-semibold">Cara menambah</legend>
          <label className="flex min-h-9 items-center gap-2 text-sm"><input type="radio" checked={!replace} onChange={() => setReplace(false)} className="accent-brand" /> Tambahkan ke daftar yang ada</label>
          <label className="flex min-h-9 items-center gap-2 text-sm"><input type="radio" checked={replace} onChange={() => setReplace(true)} className="accent-brand" /> Ganti semua kegiatan</label>
        </fieldset>
        {error && <Alert>{error}</Alert>}
        {done && <Alert tone="ok">{done}</Alert>}
        <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Tambahkan'}</Button>
      </form>
    </Card>
  );
}
