import { useMemo } from 'react';
import { addDays, diffDays, formatShortDate } from '@/lib/dates';

const SHIFT_OFFSET = { pagi: 0.25, sore: 0.6, malam: 0.9 };

/**
 * Grafik garis indikator: titik pagi/sore/malam per hari,
 * pita batas normal diarsir, titik di luar batas berwarna merah.
 */
export default function IndicatorChart({ readings, from, to, indicator, width = 360, height = 190 }) {
  const W = width, H = height, L = 38, R = 8, T = 10, B = 22;
  const span = Math.max(1, diffDays(to, from) + 1);
  const pts = useMemo(() => readings
    .map((r) => ({ ...r, t: diffDays(r.reading_date, from) + SHIFT_OFFSET[r.shift], v: Number(r.value) }))
    .sort((a, b) => a.t - b.t), [readings, from]);

  const values = pts.map((p) => p.v);
  const { min_value: lo, max_value: hi, unit } = indicator;
  const all = [...values, lo, hi].filter((v) => v !== null && v !== undefined).map(Number);
  let yMin = all.length ? Math.min(...all) : 0;
  let yMax = all.length ? Math.max(...all) : 1;
  const pad = (yMax - yMin || Math.abs(yMax) || 1) * 0.15;
  yMin -= pad; yMax += pad;

  const x = (t) => L + (t / span) * (W - L - R);
  const y = (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const dayTicks = Array.from({ length: span }, (_, i) => i).filter((i) => span <= 8 || i % Math.ceil(span / 6) === 0);
  const outCount = pts.filter((p) => p.is_out_of_range).length;
  const fmt = (v) => Number(v).toLocaleString('id-ID', { maximumFractionDigits: indicator.decimals ?? 1 });

  return (
    <figure className="m-0 flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={`Grafik ${indicator.name} ${formatShortDate(from)}–${formatShortDate(to)}: ${pts.length} catatan, ${outCount} di luar batas`}>
        {lo != null && hi != null && (
          <rect x={L} width={W - L - R} y={y(hi)} height={Math.max(0, y(lo) - y(hi))} fill="#EAF2F1" />
        )}
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#E3EAE9" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#5B6B6A">{fmt(v)}</text>
          </g>
        ))}
        {[lo, hi].filter((v) => v != null).map((v) => (
          <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#7DB5B0" strokeDasharray="4 4" />
        ))}
        {dayTicks.map((i) => (
          <text key={i} x={x(i + 0.5)} y={H - 6} textAnchor="middle" fontSize="10" fill="#5B6B6A">
            {Number(formatShortDate(addDays(from, i)).split(' ')[0])}
          </text>
        ))}
        {pts.length > 1 && <path d={path} fill="none" stroke="#0E5A5F" strokeWidth="2" strokeLinejoin="round" />}
        {pts.map((p) => (
          <circle key={`${p.reading_date}-${p.shift}`} cx={x(p.t)} cy={y(p.v)} r={p.is_out_of_range ? 5 : 3.5}
            fill={p.is_out_of_range ? '#B42318' : '#FFFFFF'} stroke={p.is_out_of_range ? '#FFFFFF' : '#0E5A5F'} strokeWidth="2" />
        ))}
        {pts.length === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="#5B6B6A">Belum ada catatan</text>}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {lo != null && hi != null && (
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 border border-[#7DB5B0] bg-brand-soft" />Normal {fmt(lo)}–{fmt(hi)} {unit}</span>
        )}
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-brand" />Pagi · sore · malam</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-bad" />Di luar batas ({outCount})</span>
      </figcaption>
    </figure>
  );
}

