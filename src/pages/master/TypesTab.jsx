import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Layers, Plus, Trash2 } from 'lucide-react';
import { useEquipmentTypes, useRoomsWithEquipment } from '@/features/master/api';
import { typeScope } from '@/features/master/scope';
import { must, useAction } from '@/hooks/useAction';
import { rows } from '@/lib/api';
import { friendlyError, supabase } from '@/lib/supabase';
import { cn } from '@/lib/cn';
import { Alert, Badge, Button, Card, Field, Input, Spinner, BlurLoading } from '@/components/ui';
import { ActivityList, AddActivities } from './ActivitiesTab';

/**
 * Master Jenis Alat: kegiatan & indikator diatur sekali per jenis
 * dan otomatis berlaku untuk setiap unit alat jenis itu.
 */
export default function TypesTab() {
  const q = useEquipmentTypes();
  const [params, setParams] = useSearchParams();
  const selId = params.get('jenis');
  const select = (id) => setParams(id ? { tab: 'jenis', jenis: id } : { tab: 'jenis' }, { replace: true });

  if (q.isPending) return <BlurLoading />;
  if (q.error) return <Alert>{friendlyError(q.error)}</Alert>;
  const selected = selId === 'baru' ? 'baru' : q.data.find((t) => t.id === selId);

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
      <div className={cn('flex flex-col gap-2', selected && 'hidden lg:flex')}>
        <p className="text-[13px] leading-relaxed text-muted">
          Atur kegiatan & indikator sekali per jenis alat. Setiap unit jenis itu di ruangan mana pun otomatis mengikutinya.
        </p>
        {q.data.length === 0 && (
          <Card className="p-4 text-sm text-muted">Belum ada jenis alat. Buat yang pertama, atau buka alat yang sudah ada di tab Ruangan & Alat lalu pilih “Jadikan jenis alat”.</Card>
        )}
        {q.data.map((t) => (
          <button key={t.id} type="button" onClick={() => select(t.id)} aria-current={selected?.id === t.id}
            className={cn('flex items-center gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left',
              selected?.id === t.id ? 'border-brand ring-2 ring-brand/20' : 'border-line hover:border-field')}>
            <Layers size={18} className="shrink-0 text-brand" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-bold">{t.name}</span>
              <span className="text-xs text-muted">{t.unitCount} unit · {t.activityCount} kegiatan · {t.indicatorIds.length} indikator</span>
            </span>
            {!t.is_active && <Badge>Nonaktif</Badge>}
            <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
          </button>
        ))}
        <Button variant="outline" onClick={() => select('baru')}><Plus size={16} aria-hidden="true" /> Tambah jenis alat</Button>
      </div>

      <div className={cn('flex flex-col gap-4', !selected && 'hidden lg:flex')}>
        {selected && (
          <button type="button" onClick={() => select(null)} className="flex h-10 items-center gap-1 self-start text-sm font-semibold text-brand lg:hidden">
            <ChevronLeft size={18} aria-hidden="true" /> Semua jenis
          </button>
        )}
        {!selected && <Card className="p-5 text-sm text-muted">Pilih jenis alat di sebelah kiri, atau tambah jenis baru.</Card>}
        {selected === 'baru' && <TypeForm key="baru" onSaved={(id) => select(id)} onCancel={() => select(null)} />}
        {selected && selected !== 'baru' && <TypeEditor key={selected.id} type={selected} types={q.data} onDeleted={() => select(null)} />}
      </div>
    </div>
  );
}

function TypeForm({ type, onSaved, onCancel, onDeleted }) {
  const { run, busy, error } = useAction();
  const [f, setF] = useState({ name: type?.name ?? '', category: type?.category ?? '', sop_note: type?.sop_note ?? '', is_active: type?.is_active ?? true });
  const dirty = !type || f.name !== type.name || f.category !== (type.category ?? '') || f.sop_note !== (type.sop_note ?? '') || f.is_active !== type.is_active;

  async function save(e) {
    e.preventDefault();
    const data = { name: f.name.trim(), category: f.category.trim() || null, sop_note: f.sop_note.trim() || null, is_active: f.is_active };
    const res = await run(async () => (type
      ? must(supabase.from('equipment_types').update(data).eq('id', type.id).select('id').single())
      : must(supabase.from('equipment_types').insert(data).select('id').single())));
    if (res) onSaved?.(res.id);
  }
  async function remove() {
    if (!window.confirm(`Hapus jenis “${type.name}”? Belum ada unit alat yang memakai jenis ini.`)) return;
    if (await run(() => must(supabase.from('equipment_types').delete().eq('id', type.id)))) onDeleted?.();
  }

  return (
    <Card className={cn('p-4', !type && 'border-2 border-brand')}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold">{type ? 'Data jenis alat' : 'Tambah jenis alat'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama jenis"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="mis. Inkubator" /></Field>
          <Field label="Kategori"><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="mis. Inkubator CO₂" /></Field>
        </div>
        <Field label="Catatan SOP (tampil di halaman ceklis setiap unit)">
          <textarea rows={3} value={f.sop_note} onChange={(e) => setF({ ...f, sop_note: e.target.value })} className="rounded-xl border border-field px-3 py-2 text-sm" />
        </Field>
        {type && (
          <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="size-5 accent-brand" />
            Jenis aktif (muncul saat menambah alat ke ruangan)
          </label>
        )}
        {error && <Alert>{/duplicate|unique/i.test(error) ? 'Nama jenis sudah ada.' : error}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || !dirty}>{busy ? 'Menyimpan…' : type ? 'Simpan' : 'Buat jenis'}</Button>
          {!type && <Button type="button" variant="ghost" onClick={onCancel}>Batal</Button>}
          {type && type.unitCount === 0 && (
            <Button type="button" variant="ghost" className="ml-auto text-bad" onClick={remove}><Trash2 size={15} aria-hidden="true" /> Hapus jenis</Button>
          )}
        </div>
        {type && type.unitCount > 0 && <p className="text-xs text-muted">Jenis yang sudah dipakai {type.unitCount} unit tidak bisa dihapus; nonaktifkan bila tidak dipakai lagi.</p>}
      </form>
    </Card>
  );
}

function TypeEditor({ type, types, onDeleted }) {
  const rooms = useRoomsWithEquipment();
  const scope = typeScope(type);
  const roomName = new Map((rooms.data ?? []).map((r) => [r.id, r.name]));
  const units = type.units.map((u) => roomName.get(u.room_id)).filter(Boolean);
  const sources = [
    ...types.filter((t) => t.id !== type.id).map((t) => ({ id: t.id, label: `Jenis · ${t.name}`, table: 'type_activities', fk: 'type_id' })),
    ...(rooms.data ?? []).flatMap((r) => r.equipment.map((e) => ({ id: e.id, label: `Alat · ${e.name} (${r.name})`, table: 'activities', fk: 'equipment_id' }))),
  ];
  return (
    <>
      <TypeForm type={type} onDeleted={onDeleted} />
      <Card className="flex flex-col gap-1.5 p-4">
        <h2 className="text-[15px] font-extrabold">Dipakai di {type.unitCount} unit</h2>
        <p className="text-sm text-muted">{units.length ? units.join(' · ') : 'Belum ada. Tambahkan unit dari tab Ruangan & Alat → Tambah alat.'}</p>
        <AttachExisting type={type} rooms={rooms.data ?? []} />
      </Card>
      <TypeIndicators type={type} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <ActivityList scope={scope} />
        <AddActivities scope={scope} sources={sources} />
      </div>
    </>
  );
}

function TypeIndicators({ type }) {
  const { run, busy, error } = useAction();
  const inds = useQuery({
    queryKey: ['master', 'indicators-list'],
    queryFn: () => rows(supabase.from('indicators').select('id,name,unit,min_value,max_value,is_active').order('name')),
  });
  const on = new Set(type.indicatorIds);
  const toggle = (id) => run(() => (on.has(id)
    ? must(supabase.from('type_indicators').delete().eq('type_id', type.id).eq('indicator_id', id))
    : must(supabase.from('type_indicators').insert({ type_id: type.id, indicator_id: id }))));
  const fmt = (v) => (v === null ? '…' : Number(v).toLocaleString('id-ID'));

  return (
    <Card className="flex flex-col gap-2 p-4">
      <h2 className="text-[15px] font-extrabold">Indikator yang dicatat</h2>
      <p className="text-xs text-muted">Dipasang otomatis ke setiap unit jenis ini. Buat indikator baru di tab Indikator.</p>
      {inds.isPending ? <BlurLoading variant="line" /> : (
        <div className="flex flex-wrap gap-2">
          {(inds.data ?? []).filter((i) => i.is_active || on.has(i.id)).map((i) => (
            <label key={i.id} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold',
              on.has(i.id) ? 'border-brand bg-brand-soft text-brand' : 'border-field text-muted', busy && 'opacity-60')}>
              <input type="checkbox" checked={on.has(i.id)} disabled={busy} onChange={() => toggle(i.id)} className="size-4 accent-brand" />
              {i.name} <span className="font-normal">({fmt(i.min_value)}–{fmt(i.max_value)} {i.unit})</span>
            </label>
          ))}
          {inds.data?.length === 0 && <p className="text-sm text-muted">Belum ada indikator.</p>}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </Card>
  );
}

/** Pasangkan alat lama (belum berjenis) ke jenis ini sekaligus.
 *  Kegiatan bernama sama otomatis disambungkan sehingga riwayatnya berlanjut. */
function AttachExisting({ type, rooms }) {
  const { run, busy, error } = useAction();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(new Set());
  const groups = rooms.map((r) => ({ room: r, items: r.equipment.filter((e) => !e.type_id && e.is_active) })).filter((g) => g.items.length);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  if (!count) return null;
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const guess = (name) => name.toLowerCase().includes(type.name.toLowerCase().split(' ')[0]);

  async function attach() {
    const ids = [...sel];
    if (await run(() => must(supabase.from('equipment').update({ type_id: type.id }).in('id', ids)))) { setSel(new Set()); setOpen(false); }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="mt-1 self-start" onClick={() => {
        setSel(new Set(groups.flatMap((g) => g.items).filter((e) => guess(e.name)).map((e) => e.id))); setOpen(true);
      }}>
        Pasangkan alat yang sudah ada ({count} alat belum berjenis)
      </Button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-field p-3">
      <p className="text-xs text-muted">
        Pilih alat lama yang termasuk jenis <b>{type.name}</b>. Kegiatan dengan nama yang sama disambungkan ke jenis (riwayat berlanjut);
        kegiatan lain tetap sebagai kegiatan khusus unit dan bisa dihapus bila tidak perlu.
      </p>
      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.room.id} className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">{g.room.name}</span>
            {g.items.map((e) => (
              <label key={e.id} className={cn('flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm',
                sel.has(e.id) ? 'border-brand bg-brand-soft font-semibold' : 'border-line')}>
                <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} className="size-4 accent-brand" />
                {e.name}{e.category ? <span className="font-normal text-muted"> · {e.category}</span> : null}
              </label>
            ))}
          </div>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !sel.size} onClick={attach}>{busy ? 'Memasangkan…' : `Pasangkan ${sel.size} alat`}</Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Batal</Button>
      </div>
    </div>
  );
}
