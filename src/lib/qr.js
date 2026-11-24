/**
 * Ubah isi QR menjadi rute di aplikasi. Hanya link SiQura yang diterima:
 *   /q?eq=…     → ceklis alat
 *   /q?ruang=…  → catat indikator ruangan
 */
export function qrToRoute(text, origin = window.location.origin) {
  let url;
  try { url = new URL(text, origin); } catch { return null; }
  if (url.pathname !== '/q' || !(url.searchParams.get('eq') || url.searchParams.get('ruang'))) return null;
  return `/q${url.search}`;
}

/** Link yang dicetak di stiker QR alat. */
export function equipmentQrUrl(equipmentId, origin = window.location.origin) {
  return `${origin}/q?eq=${equipmentId}`;
}

/** Link yang dicetak di stiker QR ruangan (pencatatan indikator). */
export function roomQrUrl(roomId, origin = window.location.origin) {
  return `${origin}/q?ruang=${roomId}`;
}
