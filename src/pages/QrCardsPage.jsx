import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Copy, Download, Printer } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRoomsWithEquipment } from '@/features/master/api';
import { rows } from '@/lib/api';
import { equipmentQrUrl, roomQrUrl } from '@/lib/qr';
import { friendlyError, supabase } from '@/lib/supabase';
import { cn } from '@/lib/cn';
import { APP } from '@/config';
import { Alert, Button, Card, Spinner, BlurLoading } from '@/components/ui';

const INK = '#13201F', BRAND = '#0E5A5F';
const KINDS = [
  { id: 'alat', label: 'QR alat', hint: 'Tempel pada tiap alat. Membuka ceklis pemeliharaan alat tersebut.' },
  { id: 'ruangan', label: 'QR ruangan', hint: 'Tempel di dinding/dekat termohigrometer. Membuka pencatatan indikator ruangan (suhu, kelembapan, tekanan).' },
];

function useQrDataUrl(text) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 480, color: { dark: INK, light: '#FFFFFF' } })
      .then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [text]);
  return url;
}

/** Gambar kartu QR ke PNG (ukuran cetak ±8 × 11 cm pada 300 dpi). */
async function cardPng({ over, title, instruction, link }) {
  await document.fonts?.load('800 40px "Plus Jakarta Sans"').catch(() => {});
  const W = 960, H = 1320, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (w, s) => `${w} ${s}px "Plus Jakarta Sans", system-ui, sans-serif`;
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
  g.fillStyle = BRAND; g.fillRect(0, 0, W, 190);
  g.fillStyle = '#FFFFFF'; g.font = font(800, 56); g.fillText(APP.name, 60, 95);
  g.fillStyle = '#D6ECEA'; g.font = font(600, 26); g.fillText(APP.unit, 60, 140);
  g.fillStyle = '#4A5A59'; g.font = font(600, 30); g.fillText(over.toUpperCase(), 60, 262);
  g.fillStyle = INK; g.font = font(800, 64);
  wrap(g, title, 60, 336, W - 120, 72);
  const img = new Image();
  img.src = await QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: 640, color: { dark: INK, light: '#FFFFFF' } });
  await img.decode();
  g.drawImage(img, (W - 640) / 2, 470, 640, 640);
  g.fillStyle = INK; g.font = font(700, 30);
  center(g, instruction, W, 1170);
  g.fillStyle = '#4A5A59'; g.font = font(500, 22);
  center(g, APP.institution, W, 1215);
  g.strokeStyle = '#CFE0DE'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
  return c.toDataURL('image/png');
}
function center(g, t, W, y) { g.fillText(t, (W - g.measureText(t).width) / 2, y); }
function wrap(g, text, x, y, max, lh) {
  const words = text.split(' '); let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > max && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t;
  }
  g.fillText(line, x, y);
}

export default function QrCardsPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const kind = params.get('jenis') === 'ruangan' ? 'ruangan' : 'alat';
  const q = useRoomsWithEquipment();
  const targets = useQuery({
    queryKey: ['master', 'room-indicators'],
    enabled: kind === 'ruangan',
    queryFn: () => rows(supabase.from('indicator_targets').select('room_id,indicator:indicators!inner(name,is_active)')
      .not('room_id', 'is', null).eq('is_active', true).eq('indicator.is_active', true)),
  });
  const [roomId, setRoomId] = useState('all');
  if (!isAdmin) return <Navigate to="/" replace />;

  const rooms = (q.data ?? []).filter((r) => r.is_active);
  const shown = rooms.filter((r) => roomId === 'all' || r.id === roomId);
  const indByRoom = new Map();
  for (const t of targets.data ?? []) {
    if (!indByRoom.has(t.room_id)) indByRoom.set(t.room_id, []);
    indByRoom.get(t.room_id).push(t.indicator.name);
  }
  const cards = kind === 'alat'
    ? shown.flatMap((r) => r.equipment.filter((e) => e.is_active).map((e) => ({
      id: e.id, over: r.name, title: e.name, instruction: 'Pindai untuk mengisi ceklis pemeliharaan', link: equipmentQrUrl(e.id),
    })))
    : shown.map((r) => ({
      id: r.id, over: 'Indikator ruangan', title: r.name, link: roomQrUrl(r.id),
      instruction: 'Pindai untuk mencatat indikator ruangan',
      detail: indByRoom.get(r.id)?.join(' · ') || 'Belum ada indikator terpasang',
      warn: !indByRoom.get(r.id),
    }));
  const hint = KINDS.find((k) => k.id === kind).hint;

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-0 print:p-0">
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm; } }'}</style>
      <div className="flex flex-col gap-3 pt-2 print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-xl font-extrabold lg:text-2xl">Kartu QR</h1>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Ruangan" value={roomId} onChange={(e) => setRoomId(e.target.value)} className="h-11 rounded-xl border border-field bg-white px-3 text-sm font-semibold">
              <option value="all">Semua ruangan</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <Button onClick={() => window.print()} disabled={!cards.length}><Printer size={17} aria-hidden="true" /> Cetak {cards.length} kartu</Button>
          </div>
        </div>
        <div role="tablist" className="flex gap-1 border-b border-line">
          {KINDS.map((k) => (
            <button key={k.id} role="tab" aria-selected={kind === k.id} onClick={() => setParams(k.id === 'alat' ? {} : { jenis: k.id }, { replace: true })}
              className={cn('h-11 border-b-[3px] px-3 text-sm', kind === k.id ? 'border-brand font-bold text-brand' : 'border-transparent font-semibold text-subtle')}>
              {k.label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted">{hint}</p>
      </div>
      {q.error && <Alert>{friendlyError(q.error)}</Alert>}
      {q.isPending && <BlurLoading />}
      {q.data && !cards.length && <Card className="p-4 text-sm text-muted">{kind === 'alat' ? 'Belum ada alat aktif.' : 'Belum ada ruangan aktif.'}</Card>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 print:grid-cols-3 print:gap-[6mm]">
        {cards.map((c) => <QrCard key={c.id} card={c} />)}
      </div>
    </div>
  );
}

function QrCard({ card }) {
  const src = useQrDataUrl(card.link);
  const [copied, setCopied] = useState(false);
  async function download() {
    const a = document.createElement('a');
    a.href = await cardPng(card);
    a.download = `QR-${card.over}-${card.title}.png`.replace(/[^\w.-]+/g, '_');
    a.click();
  }
  return (
    <div className="flex flex-col gap-2 break-inside-avoid">
      <figure className="m-0 flex flex-col overflow-hidden rounded-2xl border border-field bg-white print:rounded-none">
        <div className="bg-brand px-4 py-3 text-white">
          <p className="text-base font-extrabold">{APP.name}</p>
          <p className="text-xs leading-snug text-on-brand-muted">{APP.unit}</p>
        </div>
        <div className="flex flex-col gap-1 px-4 pt-3">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{card.over}</p>
          <p className="text-lg leading-tight font-extrabold">{card.title}</p>
          {card.detail && <p className={cn('text-xs', card.warn ? 'text-bad print:hidden' : 'text-muted')}>{card.detail}</p>}
        </div>
        {src ? <img src={src} alt={`QR ${card.title}`} className="mx-auto my-2 aspect-square w-4/5" /> : <div className="mx-auto my-2 aspect-square w-4/5 animate-pulse rounded bg-ground" />}
        <figcaption className="px-4 pb-3 text-center text-xs font-semibold">{card.instruction}</figcaption>
      </figure>
      <div className="flex gap-1 print:hidden">
        <Button variant="outline" size="sm" className="flex-1" onClick={download}><Download size={15} aria-hidden="true" /> PNG</Button>
        <Button variant="ghost" size="sm" aria-label={`Salin link ${card.title}`}
          onClick={async () => { await navigator.clipboard.writeText(card.link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          <Copy size={15} aria-hidden="true" /> {copied ? 'Tersalin' : 'Link'}
        </Button>
      </div>
    </div>
  );
}
