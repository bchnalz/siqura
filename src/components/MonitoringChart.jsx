import { useMemo } from 'react';
import { SHIFT_LABEL, SHIFT_SHORT, SHIFTS } from '@/lib/dates';
import { formatValue, niceScale, slotStatus } from '@/lib/status';

const C = {
  ink: '#13201F', muted: '#5B6B6A', grid: '#DCE5E4', day: '#9FB3B1', brand: '#0E5A5F',
  hot: '#FDE4E1', hotLine: '#D9534A', cold: '#E1ECFA', coldLine: '#3B6FB6', bad: '#B42318',
  off: '#F3F6F5', missed: '#F7D9D4',
};

/**
 * Grafik pemantauan bulanan bergaya formulir kertas "Pemantauan Suhu":
 * kolom per tanggal dibagi P·S·M, zona merah di atas batas maks,
 * zona biru di bawah batas min, titik dihubungkan garis, baris paraf di bawah.
 */
export default function MonitoringChart({ indicator, readings, days, now, title }) {
  const n = days.length;
  const cols = n * 3;
  const L = 46, R = 10, W = 1120;
  const cw = (W - L - R) / cols;
  const T0 = 0, hDay = 18, hShift = 14, T = T0 + hDay + hShift, PH = 250, hParaf = 34;
  const H = T + PH + hParaf + 2;
  const lo = indicator.min_value != null ? Number(indicator.min_value) : null;
  const hi = indicator.max_value != null ? Number(indicator.max_value) : null;

  const byKey = useMemo(() => new Map(readings.map((r) => [`${r.reading_date}|${r.shift}`, r])), [readings]);
  const scale = useMemo(() => niceScale(lo, hi, readings.map((r) => Number(r.value))), [lo, hi, readings]);
  const y = (v) => T + (1 - (v - scale.min) / (scale.max - scale.min)) * PH;
  const xCol = (i) => L + i * cw;
  const ticks = [];
  for (let v = scale.min; v <= scale.max + 1e-9; v += scale.step) ticks.push(Number(v.toFixed(6)));
  const labelEvery = ticks.length > 14 ? 2 : 1;

  const slots = days.flatMap((d, di) => SHIFTS.map((s, si) => {
    const r = byKey.get(`${d}|${s}`) ?? null;
    return { d, s, i: di * 3 + si, r, status: slotStatus({ date: d, shift: s, reading: r, indicator, now }) };
  }));
  const pts = slots.filter((x) => x.r).map((x) => ({ ...x, cx: xCol(x.i) + cw / 2, cy: y(Number(x.r.value)) }));
  const segs = pts.slice(1).map((p, k) => ({ a: pts[k], b: p, gap: p.i - pts[k].i > 1 }));
  const fmt = (v) => formatValue(v, indicator.decimals);
  const outCount = pts.filter((p) => p.r.is_out_of_range).length;
  const missedCount = slots.filter((x) => x.status === 'missed').length;

  return (
    <figure className="m-0 flex flex-col gap-2">
      {title && <figcaption className="text-sm font-bold">{title}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={`Grafik pemantauan ${indicator.name}: ${pts.length} catatan, ${outCount} di luar batas, ${missedCount} terlewat`}>
        {/* zona di luar batas */}
        {hi != null && <rect x={L} y={T} width={W - L - R} height={Math.max(0, y(hi) - T)} fill={C.hot} />}
        {lo != null && <rect x={L} y={y(lo)} width={W - L - R} height={Math.max(0, T + PH - y(lo))} fill={C.cold} />}

        {/* slot terlewat & tidak dijadwalkan */}
        {slots.map((x) => (x.status === 'missed' || x.status === 'none') && (
          <rect key={`b${x.i}`} x={xCol(x.i)} y={T} width={cw} height={PH} fill={x.status === 'missed' ? C.missed : C.off} opacity={x.status === 'missed' ? 0.55 : 1}>
            <title>{`${Number(x.d.slice(8))} · ${SHIFT_LABEL[x.s]}: ${x.status === 'missed' ? 'Terlewat' : 'Tidak dijadwalkan'}`}</title>
          </rect>
        ))}

        {/* garis bantu */}
        {ticks.map((v, k) => (
          <g key={`t${v}`}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={C.grid} strokeWidth="1" />
            {k % labelEvery === 0 && <text x={L - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill={C.muted}>{fmt(v)}</text>}
          </g>
        ))}
        {Array.from({ length: cols + 1 }, (_, i) => (
          <line key={`v${i}`} x1={xCol(i)} x2={xCol(i)} y1={i % 3 === 0 ? T0 : T0 + hDay} y2={T + PH + hParaf}
            stroke={i % 3 === 0 ? C.day : C.grid} strokeWidth={i % 3 === 0 ? 1 : 0.6} />
        ))}
        <line x1={L} x2={W - R} y1={T0} y2={T0} stroke={C.day} />
        <line x1={L} x2={W - R} y1={T0 + hDay} y2={T0 + hDay} stroke={C.grid} />
        <line x1={L} x2={W - R} y1={T} y2={T} stroke={C.day} />
        <line x1={L} x2={W - R} y1={T + PH} y2={T + PH} stroke={C.day} />
        <line x1={L} x2={W - R} y1={T + PH + hParaf} y2={T + PH + hParaf} stroke={C.day} />

        {/* batas normal */}
        {hi != null && <line x1={L} x2={W - R} y1={y(hi)} y2={y(hi)} stroke={C.hotLine} strokeWidth="1.5" />}
        {lo != null && <line x1={L} x2={W - R} y1={y(lo)} y2={y(lo)} stroke={C.coldLine} strokeWidth="1.5" />}

        {/* kepala kolom */}
        <text x={L - 6} y={T0 + 13} textAnchor="end" fontSize="10" fontWeight="700" fill={C.ink}>Tgl</text>
        {days.map((d, di) => (
          <text key={d} x={xCol(di * 3) + cw * 1.5} y={T0 + 13} textAnchor="middle" fontSize="10" fontWeight="700"
            fill={d === now.date ? C.brand : C.ink}>{Number(d.slice(8))}</text>
        ))}
        {slots.map((x) => (
          <text key={`s${x.i}`} x={xCol(x.i) + cw / 2} y={T0 + hDay + 10.5} textAnchor="middle" fontSize="7.5" fill={C.muted}>{SHIFT_SHORT[x.s]}</text>
        ))}

        {/* garis & titik */}
        {segs.map(({ a, b, gap }) => (
          <line key={`l${a.i}-${b.i}`} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke={C.brand} strokeWidth="1.5" strokeDasharray={gap ? '3 3' : undefined} opacity={gap ? 0.55 : 1} />
        ))}
        {pts.map((p) => (
          <circle key={`p${p.i}`} cx={p.cx} cy={p.cy} r={p.r.is_out_of_range ? 4.2 : 3.2}
            fill={p.r.is_out_of_range ? C.bad : '#FFFFFF'} stroke={p.r.is_out_of_range ? '#FFFFFF' : C.brand} strokeWidth="1.6">
            <title>{`${Number(p.d.slice(8))} · ${SHIFT_LABEL[p.s]}: ${fmt(p.r.value)} ${indicator.unit}${p.r.initials ? ` · ${p.r.initials}` : ''}${p.r.is_out_of_range ? ' · di luar batas' : ''}`}</title>
          </circle>
        ))}

        {/* paraf */}
        <text x={L - 6} y={T + PH + hParaf / 2 + 3.5} textAnchor="end" fontSize="9.5" fontWeight="700" fill={C.ink}>Paraf</text>
        {pts.map((p) => p.r.initials && (
          <text key={`i${p.i}`} transform={`translate(${p.cx + 3} ${T + PH + hParaf - 4}) rotate(-90)`} fontSize="8" fontWeight="600" fill={C.ink}>
            {String(p.r.initials).slice(0, 4)}
          </text>
        ))}
        {pts.length === 0 && <text x={(W + L) / 2} y={T + PH / 2} textAnchor="middle" fontSize="14" fill={C.muted}>Belum ada catatan bulan ini</text>}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {hi != null && <Legend sw="bg-[#FDE4E1] border-[#D9534A]" t={`Di atas batas maks (> ${fmt(hi)} ${indicator.unit})`} />}
        {lo != null && <Legend sw="bg-[#E1ECFA] border-[#3B6FB6]" t={`Di bawah batas min (< ${fmt(lo)} ${indicator.unit})`} />}
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-bad" />Di luar batas ({outCount})</span>
        <Legend sw="bg-[#F7D9D4]/60 border-transparent" t={`Terlewat (${missedCount})`} />
        <span>P = Pagi · S = Sore · M = Malam</span>
      </div>
    </figure>
  );
}

const Legend = ({ sw, t }) => <span className="flex items-center gap-1.5"><span className={`h-2.5 w-4 border ${sw}`} />{t}</span>;
