-- Saat alat lama dipasangkan ke Jenis Alat (atau jenis mendapat kegiatan baru),
-- kegiatan alat yang NAMANYA SAMA dengan kegiatan jenis disambungkan, bukan
-- dibuat ganda. Riwayat ceklis kegiatan itu tetap berlanjut.

create or replace function public.link_same_name_activities(p_equipment uuid, p_type uuid)
returns void language sql security definer set search_path = public as $$
  with cand as (
    select distinct on (ta.id) a.id as aid, ta.id as taid
      from public.type_activities ta
      join public.activities a
        on a.equipment_id = p_equipment
       and a.type_activity_id is null
       and lower(btrim(a.name)) = lower(btrim(ta.name))
     where ta.type_id = p_type
       and not exists (select 1 from public.activities x where x.equipment_id = p_equipment and x.type_activity_id = ta.id)
     order by ta.id, a.is_active desc, a.created_at
  )
  update public.activities a set type_activity_id = c.taid
    from cand c where a.id = c.aid;
$$;
revoke execute on function public.link_same_name_activities(uuid, uuid) from public, anon, authenticated;

create or replace function public.apply_type_to_equipment(p_equipment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t uuid;
begin
  select type_id into t from public.equipment where id = p_equipment;
  if t is null then return; end if;

  perform public.link_same_name_activities(p_equipment, t);

  insert into public.activities (equipment_id, name, interval_days, sort_order, is_active, type_activity_id)
  select p_equipment, ta.name, ta.interval_days, ta.sort_order, ta.is_active, ta.id
    from public.type_activities ta where ta.type_id = t
  on conflict (equipment_id, type_activity_id) where type_activity_id is not null
  do update set name = excluded.name, interval_days = excluded.interval_days,
                sort_order = excluded.sort_order, is_active = excluded.is_active;

  insert into public.indicator_targets (indicator_id, equipment_id, from_type, is_active)
  select ti.indicator_id, p_equipment, true, true
    from public.type_indicators ti where ti.type_id = t
  on conflict (indicator_id, equipment_id) where equipment_id is not null
  do update set is_active = true, from_type = true;
end $$;

create or replace function public.type_activity_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  e uuid;
begin
  if tg_op = 'INSERT' then
    for e in select id from public.equipment where type_id = new.type_id loop
      perform public.link_same_name_activities(e, new.type_id);
    end loop;
    insert into public.activities (equipment_id, name, interval_days, sort_order, is_active, type_activity_id)
    select eq.id, new.name, new.interval_days, new.sort_order, new.is_active, new.id
      from public.equipment eq where eq.type_id = new.type_id
    on conflict (equipment_id, type_activity_id) where type_activity_id is not null
    do update set interval_days = excluded.interval_days, sort_order = excluded.sort_order, is_active = excluded.is_active;
  else
    update public.activities
       set name = new.name, interval_days = new.interval_days, sort_order = new.sort_order, is_active = new.is_active
     where type_activity_id = new.id;
  end if;
  return null;
end $$;
