import { describe, expect, it } from 'vitest';
import { outOfRange, parseNumber, toggleSign } from './number';

describe('angka indikator', () => {
  it('menerima koma, minus unicode, spasi', () => {
    expect(parseNumber('22,4')).toBe(22.4);
    expect(parseNumber('−12.5')).toBe(-12.5);
    expect(parseNumber(' 63 ')).toBe(63);
  });
  it('menolak teks bukan angka', () => {
    expect(parseNumber('22,4,1')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
  it('batas min/maks (inklusif)', () => {
    const ind = { min_value: '-15', max_value: '-2.5' };
    expect(outOfRange(-12.5, ind)).toBe(false);
    expect(outOfRange(-2.5, ind)).toBe(false);
    expect(outOfRange(-1, ind)).toBe(true);
    expect(outOfRange(5, { min_value: null, max_value: 8 })).toBe(false);
  });
});

describe('tombol ±', () => {
  it('menambah & menghapus minus', () => {
    expect(toggleSign('12,5')).toBe('-12,5');
    expect(toggleSign('-12,5')).toBe('12,5');
    expect(toggleSign('−3')).toBe('3');
    expect(toggleSign('')).toBe('-');
    expect(parseNumber(toggleSign('12,5'))).toBe(-12.5);
  });
});
