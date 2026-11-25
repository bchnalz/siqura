import { describe, expect, it } from 'vitest';
import { buildTechMessage, normalizePhone, waLink } from './whatsapp';

describe('laporan WhatsApp', () => {
  it('menormalkan nomor', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('6281234567890');
    expect(normalizePhone('+62 812 3456 7890')).toBe('6281234567890');
    expect(normalizePhone('12')).toBe('');
    expect(waLink('', 'a b')).toBe('https://wa.me/?text=a%20b');
  });
  it('menyusun pesan lengkap', () => {
    const m = buildTechMessage({
      category: 'indikator', urgency: 'tinggi', description: 'Suhu naik terus', room: 'Laboratorium TBC',
      equipment: { name: 'Kulkas reagen 1', typeName: 'Lemari es' },
      facts: {
        readings: [{ indicator: { name: 'Suhu', unit: '°C', min_value: 2, max_value: 8, decimals: 1 }, date: '2026-11-25', shift: 'sore', value: 11.2, is_out_of_range: true, corrective_action: 'Pintu ditutup rapat' }],
        overdue: [{ name: 'Defrost', days: 3 }],
      },
      reporter: { full_name: 'Siti Aminah', initials: 'SA' }, at: new Date('2026-11-25T13:00:00Z'), link: 'https://x/alat/1',
    });
    expect(m).toContain('*Jenis laporan:* Nilai indikator di luar batas');
    expect(m).toContain('*Alat:* Kulkas reagen 1 (Lemari es)');
    expect(m).toContain('Suhu – Sore 25 Nov: 11,2 °C, normal 2–8 °C ⚠️ DI LUAR BATAS');
    expect(m).toContain('Tindakan sudah dilakukan: Pintu ditutup rapat');
    expect(m).toContain('Kegiatan terlambat: Defrost (3 hari)');
    expect(m).toContain('Siti Aminah (SA)');
    expect(m).toContain('20.00 WIB');
  });
  it('tanpa data bila tidak disertakan', () => {
    const m = buildTechMessage({ category: 'lain', urgency: 'rendah', room: 'R', facts: { overdue: [{ name: 'X', days: 1 }] }, includeFacts: false });
    expect(m).not.toContain('Kondisi tercatat');
  });
});
