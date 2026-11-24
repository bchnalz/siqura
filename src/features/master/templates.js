// Template kegiatan pemeliharaan (interval dalam hari).
// Ini titik awal yang umum; sesuaikan dengan SOP & manual alat di laboratorium.
export const TEMPLATES = [
  { id: 'bsc', name: 'Biosafety Cabinet (BSC)', items: [
    ['Disinfeksi permukaan kerja sebelum & sesudah dipakai', 1],
    ['Nyalakan blower ≥ 5 menit sebelum bekerja', 1],
    ['Periksa indikator aliran udara / alarm', 1],
    ['Nyalakan lampu UV setelah pemakaian', 1],
    ['Bersihkan bagian bawah work tray', 7],
    ['Cek jam pakai lampu UV', 30],
    ['Uji kinerja / sertifikasi BSC', 365],
  ] },
  { id: 'inkubator', name: 'Inkubator', items: [
    ['Periksa tampilan suhu sesuai setting', 1],
    ['Periksa pintu tertutup rapat', 1],
    ['Bersihkan rak & dinding dalam dengan disinfektan', 30],
    ['Verifikasi termometer / kalibrasi', 365],
  ] },
  { id: 'autoklaf', name: 'Autoklaf', items: [
    ['Periksa level air', 1],
    ['Indikator kimia pada setiap siklus', 1],
    ['Uji indikator biologis', 7],
    ['Bersihkan chamber & saringan', 7],
    ['Periksa seal / karet pintu', 30],
    ['Kalibrasi / servis berkala', 365],
  ] },
  { id: 'sentrifus', name: 'Sentrifus', items: [
    ['Bersihkan chamber setelah pemakaian', 1],
    ['Periksa keseimbangan & penutup rotor', 1],
    ['Bersihkan rotor & bucket dengan disinfektan', 7],
    ['Kalibrasi kecepatan & timer', 365],
  ] },
  { id: 'kulkas', name: 'Kulkas / Freezer reagen', items: [
    ['Periksa pintu tertutup rapat', 1],
    ['Periksa penataan & tanggal kedaluwarsa reagen', 7],
    ['Bersihkan bagian dalam', 30],
    ['Defrost (freezer)', 90],
    ['Kalibrasi termometer', 365],
  ] },
  { id: 'mikroskop', name: 'Mikroskop', items: [
    ['Bersihkan lensa objektif & okuler setelah dipakai', 1],
    ['Tutup dengan penutup debu', 1],
    ['Periksa lampu & fokus', 30],
    ['Servis berkala', 365],
  ] },
  { id: 'pcr', name: 'PCR cabinet / Thermal cycler', items: [
    ['Dekontaminasi kabinet dengan UV sebelum & sesudah dipakai', 1],
    ['Bersihkan permukaan dengan larutan dekontaminasi DNA', 1],
    ['Bersihkan blok thermal cycler', 7],
    ['Verifikasi suhu blok / kalibrasi', 365],
  ] },
];

/**
 * Tambah massal: satu baris satu kegiatan, interval opsional di akhir
 * dipisah ";" atau "|" — mis. "Bersihkan rak ; 7". Tanpa interval → default.
 */
export function parseBulk(text, defaultDays = 1) {
  return String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(.*?)[;|]\s*(\d{1,4})\s*(hari)?\s*$/i);
    const name = (m ? m[1] : line).replace(/^(?:[-•*]|\d+[.)])\s+/, '').trim();
    const days = m ? Number(m[2]) : defaultDays;
    return { name, interval_days: Math.min(3650, Math.max(1, days)) };
  }).filter((x) => x.name);
}
