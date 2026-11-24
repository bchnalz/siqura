import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { rows } from '@/lib/api';

/** Semua ruangan + alat (termasuk nonaktif) untuk admin & laporan. */
export function useRoomsWithEquipment() {
  return useQuery({
    queryKey: ['master', 'rooms-all'],
    queryFn: async () => {
      const data = await rows(supabase.from('rooms')
        .select('id,name,sop_note,sort_order,is_active,equipment(id,room_id,name,category,sop_note,sort_order,is_active,type_id)')
        .order('sort_order').order('name'));
      return data.map((r) => ({ ...r, equipment: r.equipment.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)) }));
    },
  });
}

export function useActivities(equipmentId) {
  return useQuery({
    queryKey: ['master', 'activities', equipmentId],
    enabled: Boolean(equipmentId),
    queryFn: () => rows(supabase.from('activities').select('id,name,interval_days,sort_order,is_active')
      .eq('equipment_id', equipmentId).order('sort_order').order('created_at')),
  });
}

export function useIndicatorsAdmin() {
  return useQuery({
    queryKey: ['master', 'indicators-admin'],
    queryFn: () => rows(supabase.from('indicators')
      .select('id,name,unit,min_value,max_value,decimals,shifts,is_active,targets:indicator_targets(id,room_id,equipment_id,is_active)')
      .order('name')),
  });
}

/** Jenis alat + jumlah unit & kegiatan + indikator yang terpasang. */
export function useEquipmentTypes() {
  return useQuery({
    queryKey: ['master', 'equipment-types'],
    queryFn: async () => {
      const data = await rows(supabase.from('equipment_types')
        .select('id,name,category,sop_note,is_active,units:equipment(id,room_id,is_active),acts:type_activities(id,is_active),inds:type_indicators(indicator_id)')
        .order('name'));
      return data.map((t) => ({
        ...t,
        unitCount: t.units.length,
        activityCount: t.acts.filter((a) => a.is_active).length,
        indicatorIds: t.inds.map((i) => i.indicator_id),
      }));
    },
  });
}
