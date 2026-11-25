import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRealtimeRefresh } from '@/hooks/useRealtime';
import { addDays, currentShift, formatShortDate, SHIFT_LABEL, SHIFTS, todayWib } from '@/lib/dates';
import { runOrQueue } from '@/lib/outbox';
import { friendlyError, supabase } from '@/lib/supabase';
import { Alert, Badge, Button, Card, Spinner, BlurLoading } from '@/components/ui';
import IndicatorChart from '@/components/IndicatorChart';
import NumberInput from '@/components/NumberInput';
import { cn } from '@/lib/cn';
import { outOfRange, parseNumber } from '@/lib/number';

async function rows(q) {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

function rangeText(ind) {
  const f = (v) => Number(v).toLocaleString('id-ID');
  if (ind.min_value != null && ind.max_value != null) return `${f(ind.min_value)} s/d ${f(ind.max_value)}`;
  if (ind.min_value != null) return `≥ ${f(ind.min_value)}`;
  if (ind.max_value != null) return `≤ ${f(ind.max_value)}`;
  return 'tanpa batas';
}

function useTargets() {
  return useQuery({
    queryKey: ['master', 'indicator-targets'],
    queryFn: () => rows(supabase.from('indicator_targets')
      .select('id,room_id,equipment_id,indicator:indicators!inner(id,name,unit,min_value,max_value,decimals,shifts,is_active),room:rooms(id,name,sort_order),equipment:equipment(id,name,room:rooms(name))')
      .eq('is_active', true).eq('indicator.is_active', true)),
  });
}

export default function IndicatorPage() {
  const [params, setParams] = useSearchParams();
  const targets = useTargets();
  useRealtimeRefresh(['indicator_readings']);

  const locations = useMemo(() => {
    const map = new Map();
    for (const t of targets.data ?? []) {
      const key = t.room_id ? `r:${t.room_id}` : `e:${t.equipment_id}`;
      const label = t.room ? t.room.name : `${t.equipment?.name} · ${t.equipment?.room?.name ?? ''}`;
      if (!map.has(key)) map.set(key, { key, label, isRoom: Boolean(t.room_id), order: t.room?.sort_order ?? 999, targets: [] });
      map.get(key).targets.push(t);
    }
    return [...map.values()].sort((a, b) => Number(b.isRoom) - Number(a.isRoom) || a.order - b.order || a.label.localeCompare(b.label));
  }, [targets.data]);

  const ruang = params.get('ruang');
  const requested = params.get('lok') || (ruang ? `r:${ruang}` : null);
  // dari QR ruangan: jangan diam-diam pindah ke lokasi lain bila ruangan itu belum punya indikator
  const loc = requested ? locations.find((l) => l.key === requested) : locations[0];

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="pt-2 text-xl font-extrabold">Indikator</h1>
      {targets.isPending && <BlurLoading />}
      {targets.error && <Alert>{friendlyError(targets.error)}</Alert>}
      {targets.data && locations.length === 0 && (
        <Card className="p-4 text-sm text-muted">Belum ada indikator yang dipasang. Admin dapat menambahkannya di Kelola Master.</Card>
      )}
      {(locations.length > 1 || (requested && !loc)) && locations.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Lokasi">
          {locations.map((l) => (
            <button key={l.key} type="button" aria-pressed={l.key === loc?.key} onClick={() => setParams({ lok: l.key }, { replace: true })}
              className={cn('h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold',
                l.key === loc?.key ? 'bg-brand text-white' : 'border border-field bg-white text-muted')}>
              {l.label}
            </button>
          ))}
        </div>
      )}
      {targets.data && requested && !loc && locations.length > 0 && (
        <Card className="p-4 text-sm text-muted">Lokasi ini belum punya indikator yang dicatat. Pilih lokasi lain di atas, atau minta admin memasang indikatornya.</Card>
      )}
      {loc && <LocationPanel key={loc.key} loc={loc} />}
    </div>
  );
}

function LocationPanel({ loc }) {
  const now = currentShift();
  const today = todayWib();
  const [date, setDate] = useState(now.date);
  const [shift, setShift] = useState(now.shift);
  const ids = loc.targets.map((t) => t.id);
  const readings = useQuery({
    queryKey: ['live', 'readings', loc.key, date],
    queryFn: () => rows(supabase.from('indicator_readings')
      .select('id,target_id,shift,value,is_out_of_range,corrective_action,initials,is_backdated')
      .in('target_id', ids).eq('reading_date', date)),
  });
  const active = loc.targets.filter((t) => t.indicator.shifts.includes(shift));
  const doneShifts = SHIFTS.filter((s) => {
    const sched = loc.targets.filter((t) => t.indicator.shifts.includes(s));
    return sched.length && sched.every((t) => readings.data?.some((r) => r.target_id === t.id && r.shift === s));
  });

  return (
    <>
      <Card className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          <label className="flex flex-1 flex-col gap-0.5 rounded-xl bg-ground px-3 py-1.5">
            <span className="text-xs text-muted">Tanggal</span>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="bg-transparent text-sm font-bold outline-none" />
          </label>
        </div>
        <div role="radiogroup" aria-label="Waktu pencatatan" className="grid grid-cols-3 gap-1 rounded-xl bg-ground p-1">
          {SHIFTS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={s === shift} onClick={() => setShift(s)}
              className={cn('h-10 rounded-[9px] text-[13px] font-bold', s === shift ? 'bg-white text-brand shadow-sm' : 'text-subtle')}>
              {SHIFT_LABEL[s]}{doneShifts.includes(s) ? ' ✓' : ''}
            </button>
          ))}
        </div>
        {date < now.date && <Alert tone="warn">Isi susulan untuk {formatShortDate(date)}. Waktu input asli tetap tercatat.</Alert>}
      </Card>

      {readings.isPending ? <BlurLoading /> : readings.error ? <Alert>{friendlyError(readings.error)}</Alert> : (
        active.length === 0
          ? <Card className="p-4 text-sm text-muted">Tidak ada indikator yang dijadwalkan untuk shift {SHIFT_LABEL[shift].toLowerCase()} di lokasi ini.</Card>
          : <ReadingForm key={`${date}|${shift}|${readings.dataUpdatedAt}`} targets={active} readings={readings.data} date={date} shift={shift} />
      )}

      <ChartPanel loc={loc} />
    </>
  );
}

function ReadingForm({ targets, readings, date, shift }) {
  const qc = useQueryClient();
  const existing = new Map(readings.filter((r) => r.shift === shift).map((r) => [r.target_id, r]));
  const [vals, setVals] = useState(() => Object.fromEntries(targets.map((t) => {
    const r = existing.get(t.id);
    return [t.id, { text: r ? String(r.value).replace('.', ',') : '', note: r?.corrective_action ?? '' }];
  })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const rowsToSave = targets.map((t) => {
    const v = parseNumber(vals[t.id].text);
    const r = existing.get(t.id);
    const changed = v !== null && (!r || Number(r.value) !== v || (r.corrective_action ?? '') !== vals[t.id].note);
    return { t, v, changed, out: outOfRange(v, t.indicator), note: vals[t.id].note.trim() };
  });
  const invalid = targets.filter((t) => vals[t.id].text.trim() && parseNumber(vals[t.id].text) === null);
  const missingNote = rowsToSave.filter((r) => r.changed && r.out && !r.note);
  const toSave = rowsToSave.filter((r) => r.changed);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const payload = toSave.map((r) => ({
        target_id: r.t.id, reading_date: date, shift, value: r.v, corrective_action: r.out ? r.note : (r.note || null),
      }));
      const { queued } = await runOrQueue({ kind: 'upsert', table: 'indicator_readings', rows: payload, onConflict: 'target_id,reading_date,shift' });
      setMsg(queued ? { tone: 'warn', text: 'Sinyal terputus. Catatan disimpan di HP dan dikirim otomatis saat online.' } : { tone: 'ok', text: 'Pencatatan tersimpan.' });
      if (!queued) await qc.invalidateQueries({ queryKey: ['live'] });
    } catch (e) {
      setMsg({ tone: 'bad', text: friendlyError(e) });
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      {targets.map((t) => {
        const ind = t.indicator;
        const v = parseNumber(vals[t.id].text);
        const out = outOfRange(v, ind);
        const r = existing.get(t.id);
        return (
          <Card key={t.id} className={cn('flex flex-col gap-2 px-3.5 py-3', out && 'border-bad-line')}>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`v-${t.id}`} className="text-sm font-bold">{ind.name}</label>
              <span className="text-xs text-muted">Normal {rangeText(ind)}</span>
            </div>
            <div className="flex items-center gap-2">
              <NumberInput id={`v-${t.id}`} value={vals[t.id].text} className="flex-1"
                allowNegative={ind.min_value === null || Number(ind.min_value) < 0}
                onChange={(text) => setVals((p) => ({ ...p, [t.id]: { ...p[t.id], text } }))}
                inputClassName={cn('text-xl font-bold', v === null ? 'text-ink' : out ? 'text-bad' : 'text-ok')} placeholder="—" />
              <span className="w-12 text-sm font-semibold text-muted">{ind.unit}</span>
              {v !== null && <Badge tone={out ? 'bad' : 'ok'}>{out ? 'Di luar batas' : 'Normal'}</Badge>}
            </div>
            {vals[t.id].text.trim() && v === null && <span className="text-xs font-semibold text-bad">Isi angka, mis. 22,4</span>}
            {out && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-bad">Di luar batas — wajib isi tindakan korektif</span>
                <textarea rows={2} value={vals[t.id].note}
                  onChange={(e) => setVals((p) => ({ ...p, [t.id]: { ...p[t.id], note: e.target.value } }))}
                  className="resize-none rounded-xl border border-bad-line px-3 py-2 text-[13px] outline-none focus:border-bad"
                  placeholder="Mis. AC dicek, dehumidifier dinyalakan, dicek ulang 1 jam kemudian" />
              </label>
            )}
            {r && <span className="text-xs text-subtle">Tercatat oleh {r.initials}{r.is_backdated ? ' · susulan' : ''}</span>}
          </Card>
        );
      })}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button size="lg" onClick={save} disabled={busy || !toSave.length || invalid.length > 0 || missingNote.length > 0}>
        {busy ? 'Menyimpan…' : missingNote.length ? 'Isi tindakan korektif dulu' : toSave.length ? `Simpan pencatatan ${SHIFT_LABEL[shift].toLowerCase()}` : 'Belum ada nilai baru'}
      </Button>
    </div>
  );
}

function ChartPanel({ loc }) {
  const today = todayWib();
  const [targetId, setTargetId] = useState(loc.targets[0]?.id);
  const [days, setDays] = useState(7);
  const target = loc.targets.find((t) => t.id === targetId) ?? loc.targets[0];
  const from = addDays(today, -(days - 1));
  const q = useQuery({
    queryKey: ['live', 'chart', target?.id, from, today],
    enabled: Boolean(target),
    queryFn: () => rows(supabase.from('indicator_readings')
      .select('reading_date,shift,value,is_out_of_range,corrective_action')
      .eq('target_id', target.id).gte('reading_date', from).lte('reading_date', today)),
  });
  if (!target) return null;
  const outs = (q.data ?? []).filter((r) => r.is_out_of_range).sort((a, b) => b.reading_date.localeCompare(a.reading_date));

  return (
    <Card className="mt-2 flex flex-col gap-3 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Grafik</h2>
        <div className="flex gap-1 rounded-xl bg-ground p-1">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" aria-pressed={d === days} onClick={() => setDays(d)}
              className={cn('h-8 rounded-lg px-2.5 text-xs font-bold', d === days ? 'bg-white text-brand shadow-sm' : 'text-subtle')}>{d} hari</button>
          ))}
        </div>
      </div>
      {loc.targets.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {loc.targets.map((t) => (
            <button key={t.id} type="button" aria-pressed={t.id === target.id} onClick={() => setTargetId(t.id)}
              className={cn('h-8 rounded-full px-3 text-xs font-semibold', t.id === target.id ? 'bg-brand text-white' : 'border border-field text-muted')}>
              {t.indicator.name}
            </button>
          ))}
        </div>
      )}
      {q.isPending ? <BlurLoading />
        : q.error ? <Alert>{friendlyError(q.error)}</Alert>
        : <IndicatorChart readings={q.data} from={from} to={today} indicator={target.indicator} />}
      {outs.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          <span className="text-xs font-bold text-bad">Di luar batas & tindakan korektif</span>
          {outs.slice(0, 5).map((r) => (
            <p key={r.reading_date + r.shift} className="text-xs text-ink-soft">
              <b>{formatShortDate(r.reading_date)} {SHIFT_LABEL[r.shift].toLowerCase()} · {Number(r.value).toLocaleString('id-ID')} {target.indicator.unit}</b> — {r.corrective_action}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
