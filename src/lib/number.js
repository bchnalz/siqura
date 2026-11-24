/** Angka dari ketikan petugas: "22,4", "−12.5", "-3" → number; selain itu null. */
export function parseNumber(text) {
  const t = String(text ?? '').trim().replace(/\s/g, '').replace('−', '-').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Apakah nilai di luar batas min/maks indikator. */
export function outOfRange(v, ind) {
  if (v === null || v === undefined) return false;
  return (ind.min_value != null && v < Number(ind.min_value)) || (ind.max_value != null && v > Number(ind.max_value));
}
