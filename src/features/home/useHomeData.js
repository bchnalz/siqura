import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildHomeSummary } from './summary';

async function rows(q) {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

/** Data Beranda. Kunci 'live' → otomatis dimuat ulang oleh realtime. */
export function useHomeData({ today, shift, shiftDate }) {
  return useQuery({
    queryKey: ['live', 'home', today, shift, shiftDate],
    queryFn: async () => {
      const [rooms, equipment, statuses, targets, readings] = await Promise.all([
        rows(supabase.from('rooms').select('id,name,sort_order').eq('is_active', true).order('sort_order').order('name')),
        rows(supabase.from('equipment').select('id,room_id,name').eq('is_active', true)),
        rows(supabase.from('activity_status').select('*')),
        rows(supabase.from('indicator_targets')
          .select('id,room_id,equipment_id,indicator:indicators!inner(id,name,unit,min_value,max_value,decimals,shifts,is_active)')
          .eq('is_active', true).eq('indicator.is_active', true)),
        rows(supabase.from('indicator_readings').select('target_id,shift,value,is_out_of_range').eq('reading_date', shiftDate)),
      ]);
      return buildHomeSummary({ rooms, equipment, statuses, targets, readings, today, shift });
    },
  });
}
