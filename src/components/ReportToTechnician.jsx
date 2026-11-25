import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Copy, MessageCircleWarning, Send, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { rows } from '@/lib/api';
import { addDays, dueStatus, todayWib } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { buildTechMessage, CATEGORIES, normalizePhone, URGENCY, waLink } from '@/features/report/whatsapp';
import { Alert, Button, Field, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const PHONE_KEY = 'siqura-teknisi-wa';
const readPhone = () => { try { return localStorage.getItem(PHONE_KEY) ?? ''; } catch { return ''; } };
const writePhone = (v) => { try { localStorage.setItem(PHONE_KEY, v); } catch { /* penyimpanan tidak tersedia */ } };

/** Data kondisi terkini untuk dilampirkan ke laporan (alat atau indikator ruangan). */
function useReportFacts({ roomId, equipmentId, enabled }) {
  const today = todayWib();
  return useQuery({
    queryKey: ['live', 'report-facts', roomId, equipmentId, today],
    enabled,
    queryFn: async () => {
      const targetsQ = supabase.from('indicator_targets')
        .select('id,indicator:indicators!inner(id,name,unit,min_value,max_value,decimals,is_active)')
        .eq('is_active', true).eq('indicator.is_active', true);
      const [targets, statuses] = await Promise.all([
        rows(equipmentId ? targetsQ.eq('equipment_id', equipmentId) : targetsQ.eq('room_id', roomId)),
        equipmentId ? rows(supabase.from('activity_status').select('*').eq('equipment_id', equipmentId)) : Promise.resolve([]),
      ]);
      const readings = targets.length ? await rows(supabase.from('indicator_readings')
        .select('target_id,reading_date,shift,value,is_out_of_range,corrective_action')
        .in('target_id', targets.map((t) => t.id)).gte('reading_date', addDays(today, -2))) : [];
      const order = { pagi: 0, sore: 1, malam: 2 };
      readings.sort((a, b) => (b.reading_date + order[b.shift]).localeCompare(a.reading_date + order[a.shift]));
      const picked = [];
      for (const t of targets) {
        const mine = readings.filter((r) => r.target_id === t.id);
        const latest = mine[0];
        const outs = mine.filter((r) => r.is_out_of_range && r !== latest).slice(0, 2);
        for (const r of [latest, ...outs].filter(Boolean)) {
          picked.push({ indicator: t.indicator, date: r.reading_date, shift: r.shift, value: r.value, is_out_of_range: r.is_out_of_range, corrective_action: r.corrective_action });
        }
      }
      const overdue = statuses.map((s) => ({ ...s, st: dueStatus(s, today) })).filter((s) => s.st.key === 'late')
        .sort((a, b) => b.st.days - a.st.days).map((s) => ({ name: s.name, days: s.st.days }));
      return { readings: picked, overdue };
    },
  });
}

/**
 * Tombol "Laporkan ke teknisi": menyusun pesan WhatsApp yang sistematis
 * (lokasi, alat, uraian, data terakhir, pelapor) lalu kirim via WA atau salin.
 */
export default function ReportToTechnician({ roomId, roomName, equipment, path, className, variant = 'outline', label = 'Laporkan ke teknisi' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)} className={className}>
        <MessageCircleWarning size={18} aria-hidden="true" /> {label}
      </Button>
      {open && createPortal(<ReportDialog roomId={roomId} roomName={roomName} equipment={equipment} path={path} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ReportDialog({ roomId, roomName, equipment, path, onClose }) {
  const { profile } = useAuth();
  const titleId = useId();
  const ref = useRef(null);
  const facts = useReportFacts({ roomId, equipmentId: equipment?.id, enabled: true });
  const hasOut = facts.data?.readings.some((r) => r.is_out_of_range);
  const [category, setCategory] = useState(null);
  const [urgency, setUrgency] = useState('sedang');
  const [description, setDescription] = useState('');
  const [includeFacts, setIncludeFacts] = useState(true);
  const [phone, setPhone] = useState(readPhone);
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(onClose, 200); };
  const cat = category ?? (hasOut ? 'indikator' : equipment ? 'rusak' : 'ruangan');

  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('textarea')?.focus();
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const message = useMemo(() => buildTechMessage({
    category: cat, urgency, description, room: roomName, equipment, facts: facts.data, includeFacts,
    reporter: profile, link: path ? `${window.location.origin}${path}` : undefined,
  }), [cat, urgency, description, roomName, equipment, facts.data, includeFacts, profile, path]);

  const ready = description.trim().length >= 3;
  const phoneOk = !phone.trim() || normalizePhone(phone);

  function send() {
    if (phone.trim()) writePhone(phone.trim());
    window.open(waLink(phone, message), '_blank', 'noopener');
  }
  async function copy() {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }

  return (
    <div data-closing={closing || undefined} className="dlg-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 backdrop-blur-[2px] lg:items-center" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={ref} data-closing={closing || undefined} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="dlg-panel flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white lg:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id={titleId} className="text-base font-extrabold">Laporkan ke teknisi</h2>
            <p className="truncate text-xs text-muted">{[roomName, equipment?.name].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" onClick={close} aria-label="Tutup" className="flex size-11 items-center justify-center rounded-xl hover:bg-ground"><X size={20} aria-hidden="true" /></button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4 lg:grid lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-[13px] font-semibold">Jenis laporan</legend>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCategory(c.id)}
                    className={cn('min-h-9 rounded-full px-3 py-1.5 text-left text-[13px] font-semibold', cat === c.id ? 'bg-brand text-white' : 'border border-field bg-white text-muted')}>
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col">
              <legend className="mb-1.5 text-[13px] font-semibold">Urgensi</legend>
              <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-xl bg-ground p-1">
                {URGENCY.map((u) => (
                  <button key={u.id} type="button" role="radio" aria-checked={urgency === u.id} onClick={() => setUrgency(u.id)}
                    className={cn('h-10 rounded-[9px] text-[13px] font-bold', urgency === u.id ? (u.id === 'tinggi' ? 'bg-bad text-white' : 'bg-white text-brand shadow-sm') : 'text-subtle')}>
                    {u.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field label="Uraian masalah" hint="Apa yang terjadi, sejak kapan, dan apa yang sudah dicoba.">
              <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
                className="resize-none rounded-xl border border-field px-3 py-2.5 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                placeholder={equipment ? 'Mis. Blower tidak menyala sejak pagi, lampu indikator mati.' : 'Mis. Suhu ruang terus naik sejak siang, AC terasa tidak dingin.'} />
            </Field>
            <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
              <input type="checkbox" checked={includeFacts} onChange={(e) => setIncludeFacts(e.target.checked)} className="size-5 accent-brand" />
              Sertakan data terakhir dari SiQura
              {facts.isPending && <Spinner className="size-4" />}
            </label>
            <Field label="Nomor WhatsApp teknisi (opsional)" hint="Disimpan di HP ini. Kosongkan untuk memilih kontak di WhatsApp.">
              <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx xxxx xxxx"
                className={cn('h-12 rounded-xl border bg-white px-3.5 text-[15px] outline-none focus:ring-2 focus:ring-brand/20', phoneOk ? 'border-field focus:border-brand' : 'border-bad')} />
            </Field>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Pratinjau pesan</span>
            <pre className="max-h-80 overflow-y-auto rounded-xl bg-[#E7F8E1] px-3.5 py-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink lg:max-h-[52dvh]">{message}</pre>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-line px-4 py-3 pb-safe">
          {!phoneOk && <Alert>Nomor WhatsApp belum benar. Contoh: 0812 3456 7890.</Alert>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={copy} disabled={!ready} className="flex-1">
              <Copy size={17} aria-hidden="true" /> {copied ? 'Tersalin' : 'Salin pesan'}
            </Button>
            <Button type="button" onClick={send} disabled={!ready || !phoneOk} className="flex-[1.4] bg-[#157F3D] hover:bg-[#0F6630]">
              <Send size={17} aria-hidden="true" /> Kirim via WhatsApp
            </Button>
          </div>
          {!ready && <p className="text-center text-xs text-muted">Tulis uraian masalah dulu.</p>}
        </div>
      </div>
    </div>
  );
}
