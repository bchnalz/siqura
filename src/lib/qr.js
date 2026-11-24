/** Ubah isi QR menjadi rute di aplikasi. Hanya link SiQura (/q?eq=…) yang diterima. */
export function qrToRoute(text, origin = window.location.origin) {
  let url;
  try { url = new URL(text, origin); } catch { return null; }
  if (url.pathname !== '/q' || !url.searchParams.get('eq')) return null;
  return `/q${url.search}`;
}

/** Link yang dicetak di stiker QR alat. */
export function equipmentQrUrl(equipmentId, origin = window.location.origin) {
  return `${origin}/q?eq=${equipmentId}`;
}
