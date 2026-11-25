// Semua tanggal & shift mengikuti WIB (Asia/Jakarta).
const TZ = 'Asia/Jakarta';

/** Bagian tanggal & jam WIB dari sebuah Date. */
export function wibParts(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

export function todayWib(date = new Date()) {
  return wibParts(date).iso;
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(aIso, bIso) {
  return Math.round((new Date(aIso + 'T00:00:00Z') - new Date(bIso + 'T00:00:00Z')) / 86400000);
}

export const SHIFTS = ['pagi', 'sore', 'malam'];
export const SHIFT_LABEL = { pagi: 'Pagi', sore: 'Sore', malam: 'Malam' };
export const SHIFT_SHORT = { pagi: 'P', sore: 'S', malam: 'M' };

/**
 * Shift yang sedang berjalan.
 * Pagi 07.00–13.59, Sore 14.00–20.59, Malam 21.00–06.59.
 * Malam lewat tengah malam tetap dicatat pada tanggal malam itu dimulai.
 */
export function currentShift(date = new Date()) {
  const { iso, hour } = wibParts(date);
  if (hour < 7) return { shift: 'malam', date: addDays(iso, -1) };
  if (hour < 14) return { shift: 'pagi', date: iso };
  if (hour < 21) return { shift: 'sore', date: iso };
  return { shift: 'malam', date: iso };
}

/** Sapaan menurut jam WIB (bukan shift): pagi, siang, sore, malam. */
export function greeting(date = new Date()) {
  const { hour } = wibParts(date);
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function formatLongDate(iso) {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(iso + 'T00:00:00Z'));
}

export function formatShortDate(iso) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
}

/** "Tiap 1 hari" → "Harian", dst., supaya label mudah dibaca. */
export function intervalLabel(days) {
  const named = { 1: 'Harian', 7: 'Mingguan', 14: '2 mingguan', 30: 'Bulanan', 90: '3 bulanan', 180: '6 bulanan', 365: 'Tahunan' };
  return named[days] ? `${named[days]} · ${days} hari` : `Tiap ${days} hari`;
}

/** Status jadwal untuk ditampilkan. */
export function dueStatus({ next_due, last_done }, today = todayWib()) {
  if (last_done === today) return { key: 'done', label: 'Selesai hari ini' };
  const d = diffDays(next_due, today);
  if (d < 0) return { key: 'late', label: `Terlambat ${-d} hari`, days: -d };
  if (d === 0) return { key: 'today', label: last_done ? 'Jatuh tempo hari ini' : 'Belum pernah dikerjakan' };
  if (d === 1) return { key: 'soon', label: 'Besok' };
  return { key: 'later', label: `Sisa ${d} hari` };
}
