import { useQuery } from '@tanstack/react-query';
import { rows } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const IND = 'indicator:indicators!inner(id,name,unit,min_value,max_value,decimals,shifts,notes,is_active)';

/** Satu ruangan: alat, status kegiatan, dan semua indikator (ruangan + alat di dalamnya). */
export function useRoom(id) {
  return useQuery({
    queryKey: ['live', 'room', id],
    queryFn: async () => {
      const [room, equipment, statuses] = await Promise.all([
        rows(supabase.from('rooms').select('id,name').eq('id', id).single()),
        rows(supabase.from('equipment').select('id,name,category,type:equipment_types(name)').eq('room_id', id).eq('is_active', true).order('name')),
        rows(supabase.from('activity_status').select('*').eq('room_id', id)),
      ]);
      const eqIds = equipment.map((e) => e.id);
      const base = () => supabase.from('indicator_targets').select(`id,room_id,equipment_id,${IND}`).eq('is_active', true).eq('indicator.is_active', true);
      const [roomTargets, eqTargets] = await Promise.all([
        rows(base().eq('room_id', id)),
        eqIds.length ? rows(base().in('equipment_id', eqIds)) : Promise.resolve([]),
      ]);
      const eqName = new Map(equipment.map((e) => [e.id, e.name]));
      const targets = [
        ...roomTargets.map((t) => ({ ...t, where: null, lok: `r:${id}` })),
        ...eqTargets.map((t) => ({ ...t, where: eqName.get(t.equipment_id), lok: `e:${t.equipment_id}` })),
      ].sort((a, b) => Number(Boolean(a.where)) - Number(Boolean(b.where)) || (a.where ?? '').localeCompare(b.where ?? '') || a.indicator.name.localeCompare(b.indicator.name));
      return { room, equipment, statuses, targets };
    },
  });
}

export function useReadings(targetIds, from, to) {
  return useQuery({
    queryKey: ['live', 'room-readings', targetIds.join(','), from, to],
    enabled: targetIds.length > 0,
    queryFn: () => rows(supabase.from('indicator_readings')
      .select('id,target_id,reading_date,shift,value,is_out_of_range,corrective_action,initials,is_backdated')
      .in('target_id', targetIds).gte('reading_date', from).lte('reading_date', to)),
  });
}

export function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
