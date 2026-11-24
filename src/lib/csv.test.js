import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('CSV', () => {
  it('mengutip koma, kutip, baris baru', () => {
    expect(toCsv([['a,b', 'say "hi"', 'x\ny']])).toBe('"a,b","say ""hi""","x\ny"');
  });
  it('angka negatif tetap angka, formula dinetralkan', () => {
    expect(toCsv([['-12.5', '=SUM(A1)', '+1+1', '@x']])).toBe("-12.5,'=SUM(A1),'+1+1,'@x");
  });
  it('null jadi kosong', () => {
    expect(toCsv([[null, undefined, 0]])).toBe(',,0');
  });
});
