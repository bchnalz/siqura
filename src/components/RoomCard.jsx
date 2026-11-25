import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { SHIFT_LABEL, SHIFT_SHORT, SHIFTS } from '@/lib/dates';
import { formatValue, SLOT } from '@/lib/status';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

const CELL = {
  recorded: 'bg-ok-soft text-ok', out: 'bg-bad text-white', pending: 'bg-warn-soft text-warn',
  missed: 'bg-white text-bad-strong ring-1 ring-inset ring-bad-line', upcoming: 'bg-ground text-subtle', none: 'bg-ground text-subtle',
};

/** Kartu ruangan (Beranda HP & Dashboard desktop) → membuka halaman ruangan. */
export default function RoomCard({ card, shift, detailed = false }) {
  const { room, items, checklist, state } = card;
  const shown = detailed ? items : items.filter((i) => i.status !== 'none').slice(0, 4);
  return (
    <Link to={`/ruang/${room.id}`} className="group flex flex-col gap-3 rounded-2xl border border-line bg-white px-3.5 py-3 hover:border-field lg:px-4 lg:py-3.5">
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-bold lg:text-[15px]">{room.name}</span>
        <span className="flex items-center gap-1">
          {items.length > 0 && <Badge tone={state.tone}>{state.label}</Badge>}
          <ChevronRight size={18} className="text-subtle group-hover:text-brand" aria-hidden="true" />
        </span>
      </span>

      {items.length > 0 && !detailed && (
        <span className="grid grid-cols-2 gap-1.5">
          {shown.map(({ target, indicator, where, reading, status }) => (
            <span key={target.id} className={cn('flex min-w-0 flex-col rounded-xl px-2.5 py-1.5', reading?.is_out_of_range ? 'bg-bad-soft' : 'bg-ground')}>
              <span className="truncate text-xs text-muted">{indicator.name}{where ? ` · ${where}` : ''}</span>
              {reading
                ? <span className={cn('tnum text-[15px] font-bold', reading.is_out_of_range ? 'text-bad' : 'text-ink')}>{formatValue(reading.value, indicator.decimals)} {indicator.unit}</span>
                : <span className={cn('text-[13px] font-bold', status === 'pending' ? 'text-warn' : 'text-subtle')}>{SLOT[status].label}</span>}
            </span>
          ))}
        </span>
      )}

      {items.length > 0 && detailed && (
        <span className="flex flex-col gap-1">
          <span className="grid grid-cols-[minmax(0,1fr)_repeat(3,88px)] gap-1 text-[11px] font-semibold text-subtle">
            <span>Indikator hari ini</span>
            {SHIFTS.map((s) => <span key={s} className={cn('text-center', s === shift && 'text-brand')}>{SHIFT_LABEL[s]}</span>)}
          </span>
          {items.map(({ target, indicator, where, slots }) => (
            <span key={target.id} className="grid grid-cols-[minmax(0,1fr)_repeat(3,88px)] items-center gap-1">
              <span className="truncate text-[13px]">{indicator.name}{where ? <span className="text-muted"> · {where}</span> : null}</span>
              {SHIFTS.map((s) => {
                const { reading, status } = slots[s];
                return (
                  <span key={s} title={`${SHIFT_LABEL[s]}: ${SLOT[status].label}`}
                    className={cn('tnum flex h-7 items-center justify-center rounded-md px-1 text-[11.5px] font-bold whitespace-nowrap', CELL[status])}>
                    {reading ? `${formatValue(reading.value, indicator.decimals)} ${indicator.unit}` : status === 'none' ? '·' : status === 'upcoming' ? '–' : SLOT[status].label}
                  </span>
                );
              })}
            </span>
          ))}
        </span>
      )}

      {checklist?.equipmentCount > 0 && (
        <span className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between text-xs">
            <span className="text-muted">Ceklis alat hari ini · {checklist.equipmentCount} alat{checklist.late ? <b className="text-bad"> · {checklist.late} terlambat</b> : null}</span>
            <span className={cn('tnum font-bold', checklist.late ? 'text-bad' : checklist.pct === 100 ? 'text-ok' : 'text-brand')}>{checklist.done}/{checklist.total}</span>
          </span>
          <span className="block h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={checklist.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Ceklis ${room.name}`}>
            <span className={cn('block h-1.5 rounded-full', checklist.late ? 'bg-bad' : checklist.pct === 100 ? 'bg-ok' : 'bg-brand')} style={{ width: `${checklist.pct}%` }} />
          </span>
        </span>
      )}
    </Link>
  );
}

export const SlotLegend = () => (
  <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
    {['recorded', 'out', 'pending', 'missed', 'upcoming'].map((k) => (
      <span key={k} className="flex items-center gap-1.5"><span className={cn('size-3 rounded-sm', CELL[k])} />{SLOT[k].label}</span>
    ))}
    <span>{SHIFTS.map((s) => `${SHIFT_SHORT[s]}=${SHIFT_LABEL[s]}`).join(' · ')}</span>
  </span>
);
