-- =====================================================================
--  Master JENIS ALAT
--  Kegiatan & indikator diatur sekali per jenis (mis. "Inkubator"),
--  lalu otomatis berlaku untuk setiap unit alat jenis itu di ruangan mana pun.
--  Unit tetap punya baris activities sendiri (riwayat ceklis tidak berubah);
--  baris yang berasal dari jenis ditandai type_activity_id.
-- =====================================================================

create table public.equipment_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  category    text,
  sop_note    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.type_activities (
  id             uuid primary key default gen_random_uuid(),
  type_id        uuid not null references public.equipment_types(id) on delete cascade,
  name           text not null,
  interval_days  int  not null default 1 check (interval_days between 1 and 3650),
  sort_order     int  not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
create index type_activities_type_idx on public.type_activities(type_id, sort_order);

create table public.type_indicators (
  type_id       uuid not null references public.equipment_types(id) on delete cascade,
  indicator_id  uuid not null references public.indicators(id) on delete cascade,
  primary key (type_id, indicator_id)
);

alter table public.equipment add column type_id uuid references public.equipment_types(id) on delete set null;
alter table public.activities add column type_activity_id uuid references public.type_activities(id) on delete set null;
alter table public.indicator_targets add column from_type boolean not null default false;
create index equipment_type_idx on public.equipment(type_id);
create unique index activities_unit_type_uq on public.activities(equipment_id, type_activity_id) where type_activity_id is not null;

-- ---------------------------------------------------------------------
-- Terapkan kegiatan & indikator jenis ke satu unit (aman dipanggil ulang)
-- ---------------------------------------------------------------------
create or replace function public.apply_type_to_equipment(p_equipment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t uuid;
begin
  select type_id into t from public.equipment where id = p_equipment;
  if t is null then return; end if;

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

-- Unit baru / unit berganti jenis
create or replace function public.equipment_type_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.type_id is not null and old.type_id is distinct from new.type_id then
    -- lepas kegiatan & indikator dari jenis lama (riwayat tetap ada)
    update public.activities set is_active = false, type_activity_id = null
     where equipment_id = new.id and type_activity_id is not null;
    update public.indicator_targets set is_active = false, from_type = false
     where equipment_id = new.id and from_type;
  end if;
  if new.type_id is not null and (tg_op = 'INSERT' or old.type_id is distinct from new.type_id) then
    perform public.apply_type_to_equipment(new.id);
  end if;
  return null;
end $$;

create trigger equipment_type_apply after insert or update of type_id on public.equipment
  for each row execute function public.equipment_type_changed();

-- Kegiatan jenis ditambah / diubah → ikut ke semua unit
create or replace function public.type_activity_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activities (equipment_id, name, interval_days, sort_order, is_active, type_activity_id)
    select e.id, new.name, new.interval_days, new.sort_order, new.is_active, new.id
      from public.equipment e where e.type_id = new.type_id
    on conflict (equipment_id, type_activity_id) where type_activity_id is not null do nothing;
  else
    update public.activities
       set name = new.name, interval_days = new.interval_days, sort_order = new.sort_order, is_active = new.is_active
     where type_activity_id = new.id;
  end if;
  return null;
end $$;

create trigger type_activities_sync after insert or update on public.type_activities
  for each row execute function public.type_activity_sync();

-- Kegiatan jenis dihapus → di unit: dihapus bila belum pernah diisi,
-- dinonaktifkan bila sudah punya isian (riwayat & laporan lama tetap utuh)
create or replace function public.type_activity_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.activities a
   where a.type_activity_id = old.id
     and not exists (select 1 from public.checks c where c.activity_id = a.id);
  update public.activities set is_active = false, type_activity_id = null
   where type_activity_id = old.id;
  return old;
end $$;

create trigger type_activities_removed before delete on public.type_activities
  for each row execute function public.type_activity_removed();

-- Indikator jenis dipasang / dilepas → ikut ke semua unit
create or replace function public.type_indicator_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.indicator_targets (indicator_id, equipment_id, from_type, is_active)
    select new.indicator_id, e.id, true, true from public.equipment e where e.type_id = new.type_id
    on conflict (indicator_id, equipment_id) where equipment_id is not null
    do update set is_active = true, from_type = true;
  else
    update public.indicator_targets t set is_active = false
      from public.equipment e
     where t.equipment_id = e.id and e.type_id = old.type_id
       and t.indicator_id = old.indicator_id and t.from_type;
  end if;
  return null;
end $$;

create trigger type_indicators_sync after insert or delete on public.type_indicators
  for each row execute function public.type_indicator_sync();

-- Kategori jenis berubah → unit yang masih memakai kategori lama ikut berubah
create or replace function public.type_category_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category is distinct from old.category then
    update public.equipment set category = new.category
     where type_id = new.id and category is not distinct from old.category;
  end if;
  return null;
end $$;

create trigger equipment_types_category after update of category on public.equipment_types
  for each row execute function public.type_category_sync();

-- ---------------------------------------------------------------------
-- Jadikan alat yang sudah ada sebagai Jenis Alat (tanpa mengetik ulang)
-- ---------------------------------------------------------------------
create or replace function public.create_type_from_equipment(p_equipment uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  e   public.equipment;
  tid uuid;
  a   record;
  ta  uuid;
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  select * into e from public.equipment where id = p_equipment;
  if e.id is null then raise exception 'Alat tidak ditemukan'; end if;
  if e.type_id is not null then raise exception 'Alat ini sudah punya jenis'; end if;

  insert into public.equipment_types (name, category, sop_note)
  values (coalesce(nullif(btrim(p_name), ''), e.name), e.category, e.sop_note)
  returning id into tid;

  for a in select * from public.activities where equipment_id = e.id and is_active order by sort_order, created_at loop
    insert into public.type_activities (type_id, name, interval_days, sort_order)
    values (tid, a.name, a.interval_days, a.sort_order) returning id into ta;
    update public.activities set type_activity_id = ta where id = a.id;
  end loop;

  insert into public.type_indicators (type_id, indicator_id)
  select distinct tid, t.indicator_id from public.indicator_targets t
   where t.equipment_id = e.id and t.is_active
  on conflict do nothing;
  update public.indicator_targets set from_type = true where equipment_id = e.id and is_active;

  update public.equipment set type_id = tid where id = e.id;
  return tid;
end $$;
revoke execute on function public.create_type_from_equipment(uuid, text) from public, anon;
grant execute on function public.create_type_from_equipment(uuid, text) to authenticated;
revoke execute on function public.apply_type_to_equipment(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Riwayat, hak akses, RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['equipment_types','type_activities','type_indicators'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_staff())', t, t);
    execute format('create policy %I_admin_insert on public.%I for insert to authenticated with check (public.is_admin())', t, t);
    execute format('create policy %I_admin_update on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
    execute format('create policy %I_admin_delete on public.%I for delete to authenticated using (public.is_admin())', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  foreach t in array array['equipment_types','type_activities'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.write_audit()', t, t);
  end loop;
end $$;
