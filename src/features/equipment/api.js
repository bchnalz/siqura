import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

async function rows(q) {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export function useEquipment(id) {
  return useQuery({
    queryKey: ['master', 'equipment', id],
    queryFn: () => rows(supabase.from('equipment')
      .select('id,name,category,sop_note,room:rooms(id,name,sop_note),type:equipment_types(name,sop_note)').eq('id', id).single()),
  });
}

/** Kegiatan aktif + status jadwal (dari view activity_status). */
export function useActivityStatus(equipmentId) {
  return useQuery({
    queryKey: ['live', 'activity-status', equipmentId],
    queryFn: () => rows(supabase.from('activity_status').select('*')
      .eq('equipment_id', equipmentId).order('sort_order').order('name')),
  });
}

export function useChecks(equipmentId, from, to) {
  return useQuery({
    queryKey: ['live', 'checks', equipmentId, from, to],
    queryFn: () => rows(supabase.from('checks')
      .select('id,activity_id,check_date,status,initials,is_backdated,user_id,entered_at')
      .eq('equipment_id', equipmentId).gte('check_date', from).lte('check_date', to)),
  });
}

export function useAudit(equipmentId) {
  return useQuery({
    queryKey: ['live', 'audit', equipmentId],
    queryFn: () => rows(supabase.from('audit_log')
      .select('id,table_name,action,old_data,new_data,user_label,created_at')
      .eq('equipment_id', equipmentId).order('created_at', { ascending: false }).limit(60)),
  });
}
