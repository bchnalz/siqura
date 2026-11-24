import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Pencil, Plus } from 'lucide-react';
import { useRoomsWithEquipment } from '@/features/master/api';
import { must, useAction } from '@/hooks/useAction';
import { friendlyError, supabase } from '@/lib/supabase';
import { Alert, Badge, Button, Card, Field, Input, Spinner } from '@/components/ui';

export default function RoomsTab() {
  const q = useRoomsWithEquipment();
  const [editing, setEditing] = useState(null); // { type: 'room'|'equipment', item, roomId }

  if (q.isPending) return <div className="flex justify-center py-8"><Spinner /></div>;
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
                  {e.category && <span className="truncate text-xs text-muted">{e.category}</span>}
                </span>
                {!e.is_active && <Badge>Nonaktif</Badge>}
                <Link to={`/master?tab=kegiatan&alat=${e.id}`} aria-label={`Kegiatan ${e.name}`} className="flex size-9 items-center justify-center rounded-lg text-brand hover:bg-white"><ListChecks size={16} aria-hidden="true" /></Link>
                <Button variant="ghost" size="sm" aria-label={`Ubah alat ${e.name}`} onClick={() => setEditing({ type: 'equipment', item: e, roomId: r.id })}><Pencil size={15} aria-hidden="true" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing({ type: 'equipment', item: null, roomId: r.id })}>
              <Plus size={15} aria-hidden="true" /> Tambah alat
            </Button>
          </Card>
        ))}
        <Button variant="outline" onClick={() => setEditing({ type: 'room', item: null })}><Plus size={16} aria-hidden="true" /> Tambah ruangan</Button>
      </div>
      <div className="lg:sticky lg:top-6">
        {editing?.type === 'room' && <RoomForm key={editing.item?.id ?? 'new'} room={editing.item} onDone={() => setEditing(null)} />}
        {editing?.type === 'equipment' && (
          <EquipmentForm key={editing.item?.id ?? `new-${editing.roomId}`} equipment={editing.item} roomId={editing.roomId}
            rooms={q.data} onDone={() => setEditing(null)} />
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

function EquipmentForm({ equipment, roomId, rooms, onDone }) {
  const { run, busy, error } = useAction();
  const [f, setF] = useState({
    name: equipment?.name ?? '', category: equipment?.category ?? '', sop_note: equipment?.sop_note ?? '',
    room_id: equipment?.room_id ?? roomId, is_active: equipment?.is_active ?? true,
  });
  async function save(e) {
    e.preventDefault();
    const data = { ...f, name: f.name.trim(), category: f.category.trim() || null, sop_note: f.sop_note.trim() || null };
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
        <Field label="Catatan SOP alat (opsional)">
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
    </Card>
  );
}
