import { describe, expect, it } from 'vitest';
import { parseBulk, TEMPLATES } from './templates';

describe('tambah massal', () => {
  it('membaca nama & interval', () => {
    expect(parseBulk('Bersihkan rak ; 7\nCek pintu\n- Kalibrasi | 365 hari\n\n', 1)).toEqual([
      { name: 'Bersihkan rak', interval_days: 7 },
      { name: 'Cek pintu', interval_days: 1 },
      { name: 'Kalibrasi', interval_days: 365 },
    ]);
  });
  it('tidak memotong nama yang diawali angka', () => {
    expect(parseBulk('70% alkohol untuk permukaan\n1. Cek pintu')[0].name).toBe('70% alkohol untuk permukaan');
    expect(parseBulk('1. Cek pintu')[0].name).toBe('Cek pintu');
  });
  it('membatasi interval 1–3650', () => {
    expect(parseBulk('A ; 0\nB ; 9999')[0].interval_days).toBe(1);
    expect(parseBulk('A ; 0\nB ; 9999')[1].interval_days).toBe(3650);
  });
  it('template berisi interval valid', () => {
    for (const t of TEMPLATES) for (const [n, d] of t.items) expect(n && d >= 1 && d <= 3650).toBeTruthy();
  });
});
