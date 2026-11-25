import { SHIFTS } from '@/lib/dates';

/**
 * Satu kosakata status untuk setiap slot pencatatan (tanggal × shift).
 *   recorded → Tercatat        out      → Di luar batas
 *   pending  → Belum dicatat   (shift yang sedang berjalan)
 *   missed   → Terlewat        (shift sudah lewat, tidak ada catatan)
 *   upcoming → Belum waktunya  (shift belum mulai)
 *   none     → Tidak dijadwalkan untuk indikator ini
 */
export const SLOT = {
  recorded: { label: 'Tercatat', tone: 'ok' },
  out: { label: 'Di luar batas', tone: 'alert' },
  pending: { label: 'Belum dicatat', tone: 'warn' },
  missed: { label: 'Terlewat', tone: 'missed' },
  upcoming: { label: 'Belum waktunya', tone: 'muted' },
  none: { label: 'Tidak dijadwalkan', tone: 'muted' },
};

/** Posisi slot dibanding shift berjalan: -1 lampau, 0 sekarang, 1 nanti. */
export function slotTiming(date, shift, now) {
  if (date !== now.date) return date < now.date ? -1 : 1;
  const d = SHIFTS.indexOf(shift) - SHIFTS.indexOf(now.shift);
  return d < 0 ? -1 : d > 0 ? 1 : 0;
}

export function slotStatus({ date, shift, reading, indicator, now }) {
  if (indicator && !indicator.shifts?.includes(shift) && !reading) return 'none';
  if (reading) return reading.is_out_of_range ? 'out' : 'recorded';
  const t = slotTiming(date, shift, now);
  return t < 0 ? 'missed' : t === 0 ? 'pending' : 'upcoming';
}

/** Ringkasan satu ruangan pada shift berjalan. */
export function roomShiftStatus(items) {
  const scheduled = items.filter((i) => i.status !== 'none');
  if (!scheduled.length) return { key: 'none', label: 'Tidak ada indikator shift ini', tone: 'muted' };
  const out = scheduled.filter((i) => i.status === 'out').length;
  const pending = scheduled.filter((i) => i.status === 'pending' || i.status === 'missed').length;
  if (out) return { key: 'out', label: `${out} di luar batas`, tone: 'alert' };
  if (pending) return { key: 'pending', label: `${pending} belum dicatat`, tone: 'warn' };
  return { key: 'recorded', label: 'Tercatat ✓', tone: 'ok' };
}

export function formatValue(v, decimals = 1) {
  return Number(v).toLocaleString('id-ID', { minimumFractionDigits: decimals ?? 0, maximumFractionDigits: decimals ?? 1 });
}

export function rangeText(ind) {
  const f = (v) => Number(v).toLocaleString('id-ID');
  if (ind.min_value != null && ind.max_value != null) return `${f(ind.min_value)}–${f(ind.max_value)}`;
  if (ind.min_value != null) return `≥ ${f(ind.min_value)}`;
  if (ind.max_value != null) return `≤ ${f(ind.max_value)}`;
  return 'tanpa batas';
}

/**
 * Skala sumbu-Y "rapi" seperti formulir kertas: batas normal berada di tengah
 * dengan ruang di atas & bawah. Contoh lemari es 2–8 °C → 0–10, langkah 1.
 */
export function niceScale(lo, hi, values = []) {
  const nums = [lo, hi, ...values].filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
  if (!nums.length) return { min: 0, max: 10, step: 1 };
  let a = Math.min(...nums), b = Math.max(...nums);
  if (a === b) { a -= 1; b += 1; }
  const span = b - a;
  const raw = span / 8;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const pad = span * 0.25;
  const fix = (v) => Number(v.toFixed(6));
  return { min: fix(Math.floor((a - pad) / step) * step), max: fix(Math.ceil((b + pad) / step) * step), step };
}
