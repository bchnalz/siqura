import { describe, expect, it } from 'vitest';
import { addDays, currentShift, diffDays, dueStatus, greeting, intervalLabel, todayWib } from './dates';

// 2026-11-24 17:00 UTC = 25 Nov 00.00 WIB
const at = (s) => new Date(s);

describe('tanggal WIB', () => {
  it('memakai zona Jakarta', () => {
    expect(todayWib(at('2026-11-24T16:59:00Z'))).toBe('2026-11-24');
    expect(todayWib(at('2026-11-24T17:00:00Z'))).toBe('2026-11-25');
  });
  it('menghitung selisih & menambah hari lintas bulan', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(diffDays('2026-12-01', '2026-11-24')).toBe(7);
  });
});

describe('shift', () => {
  it('pagi, sore, malam', () => {
    expect(currentShift(at('2026-11-24T01:00:00Z'))).toEqual({ shift: 'pagi', date: '2026-11-24' }); // 08.00
    expect(currentShift(at('2026-11-24T09:30:00Z'))).toEqual({ shift: 'sore', date: '2026-11-24' }); // 16.30
    expect(currentShift(at('2026-11-24T15:00:00Z'))).toEqual({ shift: 'malam', date: '2026-11-24' }); // 22.00
  });
  it('malam lewat tengah malam tetap tanggal sebelumnya, sampai 06.59', () => {
    expect(currentShift(at('2026-11-24T20:00:00Z'))).toEqual({ shift: 'malam', date: '2026-11-24' }); // 03.00 tgl 25
    expect(currentShift(at('2026-11-24T23:30:00Z'))).toEqual({ shift: 'malam', date: '2026-11-24' }); // 06.30 tgl 25
    expect(currentShift(at('2026-11-25T00:00:00Z'))).toEqual({ shift: 'pagi', date: '2026-11-25' }); // 07.00 tgl 25
  });
  it('sapaan mengikuti jam', () => {
    expect(greeting(at('2026-11-24T05:00:00Z'))).toBe('Selamat siang'); // 12.00
    expect(greeting(at('2026-11-24T09:00:00Z'))).toBe('Selamat sore'); // 16.00
  });
});

describe('status jadwal', () => {
  const today = '2026-11-24';
  it('terlambat dihitung dari tanggal terakhir dikerjakan', () => {
    expect(dueStatus({ last_done: '2026-10-21', next_due: '2026-11-20' }, today)).toMatchObject({ key: 'late', days: 4 });
  });
  it('selesai hari ini', () => {
    expect(dueStatus({ last_done: today, next_due: '2026-11-25' }, today).key).toBe('done');
  });
  it('belum pernah dikerjakan = jatuh tempo hari ini', () => {
    expect(dueStatus({ last_done: null, next_due: today }, today).key).toBe('today');
  });
  it('label interval', () => {
    expect(intervalLabel(7)).toBe('Mingguan · 7 hari');
    expect(intervalLabel(45)).toBe('Tiap 45 hari');
  });
});
