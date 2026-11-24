import { describe, expect, it } from 'vitest';
import { equipmentQrUrl, qrToRoute, roomQrUrl } from './qr';

const origin = 'https://siqura.vercel.app';
describe('QR', () => {
  it('menerima link SiQura, format baru & lama', () => {
    expect(qrToRoute(`${origin}/q?eq=abc`, origin)).toBe('/q?eq=abc');
    expect(qrToRoute(`${origin}/q?room=Laboratorium+TBC&eq=BSC-II+A`, origin)).toBe('/q?room=Laboratorium+TBC&eq=BSC-II+A');
    expect(qrToRoute('https://web-qr-code-access.netlify.app/q?eq=x', origin)).toBe('/q?eq=x');
  });
  it('menolak QR lain', () => {
    expect(qrToRoute('https://contoh.com/promo', origin)).toBeNull();
    expect(qrToRoute(`${origin}/q`, origin)).toBeNull();
  });
  it('membuat link stiker alat & ruangan', () => {
    expect(equipmentQrUrl('e1', origin)).toBe(`${origin}/q?eq=e1`);
    expect(roomQrUrl('r1', origin)).toBe(`${origin}/q?ruang=r1`);
    expect(qrToRoute(roomQrUrl('r1', origin), origin)).toBe('/q?ruang=r1');
  });
});
