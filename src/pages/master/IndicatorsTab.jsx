import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useIndicatorsAdmin, useRoomsWithEquipment } from '@/features/master/api';
import { must, useAction } from '@/hooks/useAction';
import { SHIFT_LABEL, SHIFTS } from '@/lib/dates';
import { parseNumber } from '@/lib/number';
import { friendlyError, supabase } from '@/lib/supabase';
import { Alert, Badge, Button, Card, Field, Input, Spinner } from '@/components/ui';

const fmt = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

export default function IndicatorsTab() {
  const inds = useIndicatorsAdmin();
  const rooms = useRoomsWithEquipment();
  const [editing, setEditing] = useState(undefined); // undefined = tidak ada, null = baru
  if (inds.isPending || rooms.isPending) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (inds.error || rooms.error) return <Alert>{friendlyError(inds.error || rooms.error)}</Alert>;

  const roomName = new Map(rooms.data.map((r) => [r.id, r.name]));
  const eqName = new Map(rooms.data.flatMap((r) => r.equipment.map((e) => [e.id, `${e.name} (${r.name})`])));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <div className="flex flex-col gap-2">
        {inds.data.length === 0 && <Card className="p-4 text-sm text-muted">Belum ada indikator. Tambahkan mis. suhu ruang, kelembapan, tekanan diferensial, suhu kulkas reagen.</Card>}
        {inds.data.map((i) => {
          const targets = i.targets.filter((t) => t.is_active);
          const range = [i.min_value, i.max_value].every((v) => v !== null) ? `${fmt(i.min_value)}–${fmt(i.max_value)} ${i.unit}`
            : i.min_value !== null ? `≥ ${fmt(i.min_value)} ${i.unit}` : i.max_value !== null ? `≤ ${fmt(i.max_value)} ${i.unit}` : i.unit;
          return (
            <Card key={i.id} className="flex flex-col gap-1.5 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-bold">{i.name}</span>
                <span className="text-[13px] font-bold whitespace-nowrap text-brand">{range}</span>
                <Button variant="ghost" size="sm" aria-label={`Ubah ${i.name}`} onClick={() => setEditing(i)}><Pencil size={15} aria-hidden="true" /></Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="brand">{i.shifts.map((s) => SHIFT_LABEL[s]).join(' · ')}</Badge>
                {!i.is_active && <Badge>Nonaktif</Badge>}
              </div>
              <p className="text-xs text-muted">
                {targets.length ? targets.map((t) => (t.room_id ? roomName.get(t.room_id) : eqName.get(t.equipment_id))).filter(Boolean).join(', ') : 'Belum dipasang di lokasi mana pun'}
              </p>
            </Card>
          );
        })}
        <Button variant="outline" onClick={() => setEditing(null)}><Plus size={16} aria-hidden="true" /> Tambah indikator</Button>
      </div>
      <div className="lg:sticky lg:top-6">
        {editing !== undefined
          ? <IndicatorForm key={editing?.id ?? 'new'} indicator={editing} rooms={rooms.data} onDone={() => setEditing(undefined)} />
          : <Card className="hidden p-4 text-sm text-muted lg:block">Pilih indikator untuk diubah, atau tambah yang baru.</Card>}
      </div>
    </div>
  );
}

function IndicatorForm({ indicator, rooms, onDone }) {
  const { run, busy, error, setError } = useAction();
  const active = new Set((indicator?.targets ?? []).filter((t) => t.is_active).map((t) => (t.room_id ? `r:${t.room_id}` : `e:${t.equipment_id}`)));
  const [f, setF] = useState({
    name: indicator?.name ?? '', unit: indicator?.unit ?? '', min: fmt(indicator?.min_value), max: fmt(indicator?.max_value),
    decimals: indicator?.decimals ?? 1, shifts: indicator?.shifts ?? ['pagi', 'sore', 'malam'], is_active: indicator?.is_active ?? true,
  });
  const [sel, setSel] = useState(active);
  const toggle = (k) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function save(e) {
    e.preventDefault();
    const min = f.min.trim() ? parseNumber(f.min) : null;
    const max = f.max.trim() ? parseNumber(f.max) : null;
    if ((f.min.trim() && min === null) || (f.max.trim() && max === null)) return setError('Batas min/maks harus angka, mis. 2 atau -15 atau 2,5.');
    if (min !== null && max !== null && min > max) return setError('Batas min tidak boleh lebih besar dari batas maks.');
    if (!f.shifts.length) return setError('Pilih minimal satu waktu pencatatan.');
    const data = { name: f.name.trim(), unit: f.unit.trim(), min_value: min, max_value: max, decimals: Number(f.decimals), shifts: SHIFTS.filter((s) => f.shifts.includes(s)), is_active: f.is_active };
    const ok = await run(async () => {
      const saved = indicator
        ? (await must(supabase.from('indicators').update(data).eq('id', indicator.id).select('id').single()))
        : (await must(supabase.from('indicators').insert(data).select('id').single()));
      const existing = indicator?.targets ?? [];
      const keyOf = (t) => (t.room_id ? `r:${t.room_id}` : `e:${t.equipment_id}`);
      const ops = [];
      for (const t of existing) {
        const want = sel.has(keyOf(t));
        if (want !== t.is_active) ops.push(must(supabase.from('indicator_targets').update({ is_active: want }).eq('id', t.id)));
      }
      const have = new Set(existing.map(keyOf));
      const fresh = [...sel].filter((k) => !have.has(k)).map((k) => ({
        indicator_id: saved.id, room_id: k.startsWith('r:') ? k.slice(2) : null, equipment_id: k.startsWith('e:') ? k.slice(2) : null,
      }));
      if (fresh.length) ops.push(must(supabase.from('indicator_targets').insert(fresh)));
      await Promise.all(ops);
    });
    if (ok) onDone();
  }

  return (
    <Card className="border-2 border-brand p-4">
      <form onSubmit={save} className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold">{indicator ? 'Ubah indikator' : 'Tambah indikator'}</h2>
        <Field label="Nama indikator"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="mis. Suhu ruang" /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Satuan"><Input required value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="°C" /></Field>
          <Field label="Batas min"><Input inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} placeholder="20" /></Field>
          <Field label="Batas maks"><Input inputMode="decimal" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} placeholder="25" /></Field>
        </div>
        <Field label="Angka di belakang koma">
          <select value={f.decimals} onChange={(e) => setF({ ...f, decimals: Number(e.target.value) })} className="h-11 rounded-xl border border-field bg-white px-3 text-sm">
            {[0, 1, 2, 3].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[13px] font-semibold">Waktu pencatatan</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {SHIFTS.map((s) => (
              <label key={s} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-field text-sm font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand">
                <input type="checkbox" checked={f.shifts.includes(s)} className="accent-brand"
                  onChange={() => setF({ ...f, shifts: f.shifts.includes(s) ? f.shifts.filter((x) => x !== s) : [...f.shifts, s] })} />
                {SHIFT_LABEL[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[13px] font-semibold">Dipasang di</legend>
          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-xl border border-line p-2">
            {rooms.map((r) => (
              <div key={r.id} className="flex flex-col">
                <label className="flex min-h-9 items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={sel.has(`r:${r.id}`)} onChange={() => toggle(`r:${r.id}`)} className="size-4 accent-brand" /> Ruangan · {r.name}
                </label>
                {r.equipment.map((e) => (
                  <label key={e.id} className="ml-6 flex min-h-8 items-center gap-2 text-[13px] text-muted">
                    <input type="checkbox" checked={sel.has(`e:${e.id}`)} onChange={() => toggle(`e:${e.id}`)} className="size-4 accent-brand" /> Alat · {e.name}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
        {indicator && (
          <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="size-5 accent-brand" /> Indikator aktif
          </label>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>Batal</Button>
        </div>
      </form>
    </Card>
  );
}
