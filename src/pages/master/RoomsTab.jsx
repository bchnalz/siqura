import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, ListChecks, Pencil, Plus } from 'lucide-react';
import { useEquipmentTypes, useRoomsWithEquipment } from '@/features/master/api';
import { cn } from '@/lib/cn';
import { must, useAction } from '@/hooks/useAction';
import { friendlyError, supabase } from '@/lib/supabase';
import { Alert, Badge, Button, Card, Field, Input, Spinner, BlurLoading } from '@/components/ui';

export default function RoomsTab() {
  const q = useRoomsWithEquipment();
  const types = useEquipmentTypes();
  const typeName = new Map((types.data ?? []).map((t) => [t.id, t.name]));
  const [editing, setEditing] = useState(null); // { type: 'room'|'equipment'|'add', item, roomId }

  if (q.isPending) return <BlurLoading />;
  if (q.error) return <Alert>{friendlyError(q.error)}</Alert>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="flex flex-col gap-3">
        {q.data.length === 0 && <Card className="p-4 text-sm text-muted">Belum ada ruangan. Tambahkan ruangan pertama.</Card>}
        {q.data.map((r) => (
          <Card key={r.id} className="flex flex-col gap-2 p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[15px] font-bold">{r.name}</span>
              {!r.is_active && <Badge>Nonaktif</Badge>}
              <Button variant="ghost" size="sm" aria-label={`Ubah ruangan ${r.name}`} onClick={() => setEditing({ type: 'room', item: r })}><Pencil size={15} aria-hidden="true" /></Button>
            </div>
            {r.equipment.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-xl bg-ground px-3 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{e.name}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                    {e.type_id ? <span className="inline-flex items-center gap-1 font-semibold text-brand"><Layers size={12} aria-hidden="true" />{typeName.get(e.type_id)}</span> : <span>Tanpa jenis</span>}
                    {e.category && e.category !== typeName.get(e.type_id) && <span>· {e.category}</span>}
                  </span>
                </span>
                {!e.is_active && <Badge>Nonaktif</Badge>}
                <Link to={`/master?tab=kegiatan&alat=${e.id}`} aria-label={`Kegiatan ${e.name}`} className="flex size-9 items-center justify-center rounded-lg text-brand hover:bg-white"><ListChecks size={16} aria-hidden="true" /></Link>
                <Button variant="ghost" size="sm" aria-label={`Ubah alat ${e.name}`} onClick={() => setEditing({ type: 'equipment', item: e, roomId: r.id })}><Pencil size={15} aria-hidden="true" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing({ type: 'add', roomId: r.id })}>
              <Plus size={15} aria-hidden="true" /> Tambah alat
            </Button>
          </Card>
        ))}
        <Button variant="outline" onClick={() => setEditing({ type: 'room', item: null })}><Plus size={16} aria-hidden="true" /> Tambah ruangan</Button>
      </div>
      <div className="lg:sticky lg:top-6">
        {editing?.type === 'room' && <RoomForm key={editing.item?.id ?? 'new'} room={editing.item} onDone={() => setEditing(null)} />}
        {editing?.type === 'add' && (
          <AddUnits key={`add-${editing.roomId}`} room={q.data.find((r) => r.id === editing.roomId)} types={types.data ?? []}
            onManual={() => setEditing({ type: 'equipment', item: null, roomId: editing.roomId })} onDone={() => setEditing(null)} />
        )}
        {editing?.type === 'equipment' && (
          <EquipmentForm key={editing.item?.id ?? `new-${editing.roomId}`} equipment={editing.item} roomId={editing.roomId}
            rooms={q.data} types={types.data ?? []} onDone={() => setEditing(null)} />
        )}
        {!editing && <Card className="hidden p-4 text-sm text-muted lg:block">Pilih ruangan atau alat untuk diubah, atau tambah yang baru.</Card>}
      </div>
    </div>
  );
}

function RoomForm({ room, onDone }) {
  const { run, busy, error } = useAction();
  const [f, setF] = useState({ name: room?.name ?? '', sop_note: room?.sop_note ?? '', sort_order: room?.sort_order ?? 0, is_active: room?.is_active ?? true });
  async function save(e) {
    e.preventDefault();
    const data = { ...f, name: f.name.trim(), sop_note: f.sop_note.trim() || null, sort_order: Number(f.sort_order) || 0 };
    const ok = await run(() => must(room ? supabase.from('rooms').update(data).eq('id', room.id) : supabase.from('rooms').insert(data)));
    if (ok) onDone();
  }
  return (
    <Card className="border-2 border-brand p-4">
      <form onSubmit={save} className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold">{room ? 'Ubah ruangan' : 'Tambah ruangan'}</h2>
        <Field label="Nama ruangan"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="mis. Laboratorium TBC" /></Field>
        <Field label="Catatan SOP ruangan (opsional)">
          <textarea rows={3} value={f.sop_note} onChange={(e) => setF({ ...f, sop_note: e.target.value })} className="rounded-xl border border-field px-3 py-2 text-sm" />
        </Field>
        <Field label="Urutan tampil"><Input type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
        {room && (
          <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="size-5 accent-brand" />
            Ruangan aktif
          </label>
        )}
        {error && <Alert>{/duplicate|unique/i.test(error) ? 'Nama ruangan sudah ada.' : error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>Batal</Button>
        </div>
        {room && <p className="text-xs text-muted">Menonaktifkan ruangan menyembunyikannya dari petugas tanpa menghapus riwayat ceklis.</p>}
      </form>
    </Card>
  );
}

function EquipmentForm({ equipment, roomId, rooms, types, onDone }) {
  const { run, busy, error } = useAction();
  const [f, setF] = useState({
    name: equipment?.name ?? '', category: equipment?.category ?? '', sop_note: equipment?.sop_note ?? '',
    room_id: equipment?.room_id ?? roomId, is_active: equipment?.is_active ?? true, type_id: equipment?.type_id ?? '',
  });
  const [convertName, setConvertName] = useState(equipment?.name ?? '');
  async function save(e) {
    e.preventDefault();
    if (equipment?.type_id && f.type_id !== (equipment.type_id ?? '') &&
      !window.confirm('Ganti jenis alat? Kegiatan dari jenis lama dinonaktifkan (riwayat tetap ada) dan diganti kegiatan jenis baru.')) return;
    const data = { ...f, name: f.name.trim(), category: f.category.trim() || null, sop_note: f.sop_note.trim() || null, type_id: f.type_id || null };
    const ok = await run(() => must(equipment ? supabase.from('equipment').update(data).eq('id', equipment.id) : supabase.from('equipment').insert(data)));
    if (ok) onDone();
  }
  return (
    <Card className="border-2 border-brand p-4">
      <form onSubmit={save} className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold">{equipment ? 'Ubah alat' : 'Tambah alat'}</h2>
        <Field label="Nama alat"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="mis. BSC-II A" /></Field>
        <Field label="Kategori"><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="mis. Biosafety Cabinet Kelas II" /></Field>
        <Field label="Ruangan">
          <select value={f.room_id} onChange={(e) => setF({ ...f, room_id: e.target.value })} className="h-12 rounded-xl border border-field bg-white px-3 text-[15px]">
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Jenis alat" hint={f.type_id ? 'Kegiatan & indikator mengikuti jenis ini.' : 'Tanpa jenis: kegiatan diatur sendiri untuk alat ini.'}>
          <select value={f.type_id} onChange={(e) => setF({ ...f, type_id: e.target.value })} className="h-12 rounded-xl border border-field bg-white px-3 text-[15px]">
            <option value="">Tanpa jenis</option>
            {types.filter((t) => t.is_active || t.id === f.type_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Catatan SOP khusus alat ini (opsional)">
          <textarea rows={3} value={f.sop_note} onChange={(e) => setF({ ...f, sop_note: e.target.value })} className="rounded-xl border border-field px-3 py-2 text-sm" />
        </Field>
        {equipment && (
          <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="size-5 accent-brand" />
            Alat aktif
          </label>
        )}
        {error && <Alert>{/duplicate|unique/i.test(error) ? 'Nama alat sudah ada di ruangan ini.' : error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>Batal</Button>
        </div>
        {!equipment && <p className="text-xs text-muted">Setelah disimpan, isi daftar kegiatannya di tab Kegiatan (ikon daftar).</p>}
      </form>
      {equipment && !equipment.type_id && (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="text-sm font-bold">Jadikan jenis alat</h3>
          <p className="text-xs text-muted">Kegiatan & indikator alat ini dijadikan Jenis Alat, sehingga alat sejenis di ruangan lain tinggal dipilih tanpa mengetik ulang.</p>
          <div className="flex gap-2">
            <Input aria-label="Nama jenis" value={convertName} onChange={(e) => setConvertName(e.target.value)} placeholder="Nama jenis, mis. Inkubator" />
            <Button type="button" variant="outline" disabled={busy || !convertName.trim()}
              onClick={async () => { if (await run(() => must(supabase.rpc('create_type_from_equipment', { p_equipment: equipment.id, p_name: convertName.trim() })))) onDone(); }}>
              <Layers size={15} aria-hidden="true" /> Jadikan
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Tambah alat ke ruangan dari Jenis Alat: tampilkan jenis yang belum ada di ruangan ini. */
function AddUnits({ room, types, onManual, onDone }) {
  const { run, busy, error } = useAction();
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState(new Set());
  const inRoom = new Set(room.equipment.map((e) => e.type_id).filter(Boolean));
  const active = types.filter((t) => t.is_active);
  const list = active.filter((t) => showAll || !inRoom.has(t.id));
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function add() {
    const names = new Set(room.equipment.map((e) => e.name.toLowerCase()));
    const rowsToAdd = active.filter((t) => sel.has(t.id)).map((t) => {
      let name = t.name, n = 2;
      while (names.has(name.toLowerCase())) name = `${t.name} ${n++}`; // unit kedua: "Inkubator 2"
      names.add(name.toLowerCase());
      return { room_id: room.id, name, category: t.category, type_id: t.id };
    });
    if (await run(() => must(supabase.from('equipment').insert(rowsToAdd)))) onDone();
  }

  return (
    <Card className="flex flex-col gap-3 border-2 border-brand p-4">
      <div>
        <h2 className="text-[15px] font-extrabold">Tambah alat ke {room.name}</h2>
        <p className="text-xs text-muted">Pilih jenis alat. Kegiatan & indikatornya ikut otomatis.</p>
      </div>
      {active.length === 0 ? (
        <p className="text-sm text-muted">Belum ada Jenis Alat. Buat di tab <b>Jenis Alat</b>, atau tambah alat tanpa jenis.</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">Semua jenis alat sudah ada di ruangan ini.</p>
      ) : (
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {list.map((t) => (
            <label key={t.id} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2',
              sel.has(t.id) ? 'border-brand bg-brand-soft' : 'border-line hover:border-field')}>
              <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} className="size-5 accent-brand" />
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-bold">{t.name}</span>
                <span className="text-xs text-muted">{t.activityCount} kegiatan · {t.indicatorIds.length} indikator{inRoom.has(t.id) ? ' · sudah ada di ruangan ini' : ''}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {active.some((t) => inRoom.has(t.id)) && (
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-4 accent-brand" />
          Tampilkan juga jenis yang sudah ada (unit kedua, dst.)
        </label>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || sel.size === 0} onClick={add} className="flex-1">{busy ? 'Menambahkan…' : sel.size ? `Tambah ${sel.size} alat` : 'Pilih jenis alat'}</Button>
        <Button variant="ghost" onClick={onDone}>Batal</Button>
      </div>
      <button type="button" onClick={onManual} className="self-start text-[13px] font-semibold text-brand underline-offset-2 hover:underline">Tambah alat tanpa jenis (isi manual)</button>
    </Card>
  );
}
