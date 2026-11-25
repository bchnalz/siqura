import { APP } from '@/config';
import { formatShortDate, SHIFT_LABEL } from '@/lib/dates';
import { formatValue, rangeText } from '@/lib/status';

export const CATEGORIES = [
  { id: 'rusak', label: 'Alat rusak / tidak berfungsi' },
  { id: 'indikator', label: 'Nilai indikator di luar batas' },
  { id: 'servis', label: 'Perlu kalibrasi / servis berkala' },
  { id: 'ruangan', label: 'Fasilitas ruangan (AC, listrik, air, dll.)' },
  { id: 'lain', label: 'Lainnya' },
];

export const URGENCY = [
  { id: 'rendah', label: 'Rendah', text: 'Rendah – bisa dijadwalkan' },
  { id: 'sedang', label: 'Sedang', text: 'Sedang – mohon ditangani minggu ini' },
  { id: 'tinggi', label: 'Segera', text: 'TINGGI – mohon segera, mengganggu layanan' },
];

/** Nomor WA: 08xx / +62xx / 62xx → 62xx. Kosong/tidak valid → ''. */
export function normalizePhone(input) {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  if (d.startsWith('8')) d = '62' + d;
  return d.length >= 10 && d.length <= 15 ? d : '';
}

export function waLink(phone, text) {
  const n = normalizePhone(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

/**
 * Pesan laporan ke teknisi, tersusun tetap supaya mudah dibaca & ditindaklanjuti.
 * facts.readings: [{ indicator, date, shift, value, is_out_of_range, corrective_action }]
 * facts.overdue:  [{ name, days }]
 */
export function buildTechMessage({ category, urgency, description, room, equipment, facts = {}, reporter, at = new Date(), link, includeFacts = true }) {
  const cat = CATEGORIES.find((c) => c.id === category)?.label ?? category;
  const urg = URGENCY.find((u) => u.id === urgency)?.text ?? urgency;
  const when = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(at);
  const L = [];
  L.push('*LAPORAN KE TEKNISI*');
  L.push(`${APP.unit} – ${APP.institution}`);
  L.push('');
  L.push(`*Jenis laporan:* ${cat}`);
  L.push(`*Urgensi:* ${urg}`);
  L.push(`*Ruangan:* ${room || '–'}`);
  if (equipment) L.push(`*Alat:* ${equipment.name}${equipment.typeName && equipment.typeName !== equipment.name ? ` (${equipment.typeName})` : ''}`);
  L.push('');
  L.push('*Uraian masalah:*');
  L.push((description || '').trim() || '–');

  if (includeFacts) {
    const readings = facts.readings ?? [];
    const overdue = facts.overdue ?? [];
    if (readings.length || overdue.length) {
      L.push('');
      L.push('*Kondisi tercatat di SiQura:*');
      for (const r of readings) {
        const ind = r.indicator;
        const val = `${formatValue(r.value, ind.decimals)} ${ind.unit}`.trim();
        L.push(`• ${ind.name}${r.where ? ` (${r.where})` : ''} – ${SHIFT_LABEL[r.shift]} ${formatShortDate(r.date)}: ${val}, normal ${rangeText(ind)} ${ind.unit}${r.is_out_of_range ? ' ⚠️ DI LUAR BATAS' : ''}`);
        if (r.is_out_of_range && r.corrective_action) L.push(`   Tindakan sudah dilakukan: ${r.corrective_action}`);
      }
      for (const o of overdue) L.push(`• Kegiatan terlambat: ${o.name} (${o.days} hari)`);
    }
  }
  L.push('');
  L.push(`*Pelapor:* ${reporter?.full_name || '–'}${reporter?.initials ? ` (${reporter.initials})` : ''}`);
  L.push(`*Waktu:* ${when} WIB`);
  if (link) L.push(`*Detail:* ${link}`);
  return L.join('\n');
}
