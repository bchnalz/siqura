import { describe, expect, it } from 'vitest';
import { niceScale, roomShiftStatus, slotStatus } from './status';

const now = { date: '2026-11-25', shift: 'sore' };
const ind = { shifts: ['pagi', 'sore', 'malam'] };

describe('status slot', () => {
  it('membedakan terlewat, belum dicatat, belum waktunya', () => {
    expect(slotStatus({ date: '2026-11-25', shift: 'pagi', indicator: ind, now })).toBe('missed');
    expect(slotStatus({ date: '2026-11-25', shift: 'sore', indicator: ind, now })).toBe('pending');
    expect(slotStatus({ date: '2026-11-25', shift: 'malam', indicator: ind, now })).toBe('upcoming');
    expect(slotStatus({ date: '2026-11-24', shift: 'malam', indicator: ind, now })).toBe('missed');
    expect(slotStatus({ date: '2026-11-26', shift: 'pagi', indicator: ind, now })).toBe('upcoming');
  });
  it('catatan menang atas jadwal', () => {
    expect(slotStatus({ date: '2026-11-25', shift: 'pagi', reading: { is_out_of_range: false }, indicator: ind, now })).toBe('recorded');
    expect(slotStatus({ date: '2026-11-25', shift: 'pagi', reading: { is_out_of_range: true }, indicator: ind, now })).toBe('out');
    expect(slotStatus({ date: '2026-11-25', shift: 'malam', indicator: { shifts: ['pagi'] }, now })).toBe('none');
  });
  it('ringkasan ruangan', () => {
    expect(roomShiftStatus([{ status: 'recorded' }, { status: 'pending' }]).label).toBe('1 belum dicatat');
    expect(roomShiftStatus([{ status: 'recorded' }, { status: 'out' }]).key).toBe('out');
    expect(roomShiftStatus([{ status: 'recorded' }]).label).toBe('Tercatat ✓');
  });
});

describe('skala grafik', () => {
  it('lemari es 2–8 → 0–10', () => expect(niceScale(2, 8)).toEqual({ min: 0, max: 10, step: 1 }));
  it('memuat nilai di luar batas', () => {
    const s = niceScale(2, 8, [12.4]);
    expect(s.max).toBeGreaterThanOrEqual(12.4);
    expect(s.min).toBeLessThanOrEqual(2);
  });
  it('suhu ruang 20–25', () => {
    const s = niceScale(20, 25);
    expect(s.min).toBeLessThan(20); expect(s.max).toBeGreaterThan(25);
  });
});
