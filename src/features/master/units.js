// Satuan indikator yang umum di laboratorium, supaya petugas tidak perlu
// mengetik simbol seperti ° atau ₂. "Lainnya" tetap bisa diketik sendiri.
export const UNITS = [
  { value: '°C', label: '°C · suhu' },
  { value: '%RH', label: '%RH · kelembapan relatif' },
  { value: 'Pa', label: 'Pa · tekanan (Pascal)' },
  { value: 'mmH₂O', label: 'mmH₂O · tekanan (milimeter air)' },
  { value: 'inH₂O', label: 'inH₂O · tekanan (inci air)' },
  { value: '%', label: '% · persen (mis. CO₂ inkubator)' },
  { value: 'ppm', label: 'ppm · konsentrasi gas' },
  { value: 'm/s', label: 'm/s · kecepatan aliran udara' },
  { value: 'lux', label: 'lux · intensitas cahaya' },
  { value: 'rpm', label: 'rpm · putaran per menit' },
  { value: 'bar', label: 'bar · tekanan' },
  { value: 'psi', label: 'psi · tekanan' },
  { value: 'menit', label: 'menit · waktu' },
  { value: 'jam', label: 'jam · waktu' },
];

export const isKnownUnit = (u) => UNITS.some((x) => x.value === u);
