-- =====================================================================
--  SiQura — Sistem QR Ruangan dan Alat
--  Laboratorium Mikrobiologi Klinik dan Biomolekuler
--  Migration awal: master data, jadwal berbasis hari, ceklis,
--  indikator (pagi/sore/malam), push subscription, audit, RLS.
-- =====================================================================

-- Tanggal "hari ini" selalu menurut WIB
create or replace function public.today_wib()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Jakarta')::date;
$$;

-- ---------------------------------------------------------------------
-- PROFIL PETUGAS
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  initials    text,
  role        text not null default 'petugas' check (role in ('petugas','admin')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, initials, role)
  values (
    new.id, new.email,
    new.raw_user_meta_data->>'full_name',
    upper(new.raw_user_meta_data->>'initials'),
    coalesce(nullif(new.raw_app_meta_data->>'siqura_role',''), 'petugas')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active);
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

-- ---------------------------------------------------------------------
-- MASTER: RUANGAN, ALAT, KEGIATAN (jadwal dalam hari)
-- ---------------------------------------------------------------------
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sop_note    text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.equipment (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  name        text not null,
  category    text,
  sop_note    text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (room_id, name)
);
create index equipment_room_idx on public.equipment(room_id);

create table public.activities (
  id             uuid primary key default gen_random_uuid(),
  equipment_id   uuid not null references public.equipment(id) on delete cascade,
  name           text not null,
  interval_days  int  not null default 1 check (interval_days between 1 and 3650),
  sort_order     int  not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
create index activities_equipment_idx on public.activities(equipment_id, sort_order);

-- ---------------------------------------------------------------------
-- CEKLIS: satu baris = satu kegiatan pada satu tanggal
--   status 'done' = ✓ selesai, 'na' = – alat tidak digunakan / libur
-- ---------------------------------------------------------------------
create table public.checks (
  id            bigint generated always as identity primary key,
  equipment_id  uuid not null references public.equipment(id) on delete cascade,
  activity_id   uuid not null references public.activities(id) on delete cascade,
  check_date    date not null,
  status        text not null check (status in ('done','na')),
  initials      text not null default '',
  note          text,
  user_id       uuid references auth.users(id) on delete set null,
  entered_at    timestamptz not null default now(),
  is_backdated  boolean not null default false,
  unique (activity_id, check_date)
);
create index checks_equipment_date_idx on public.checks(equipment_id, check_date);

-- ---------------------------------------------------------------------
-- INDIKATOR (suhu, tekanan, kelembapan, …)
-- ---------------------------------------------------------------------
create table public.indicators (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  unit        text not null,
  min_value   numeric,
  max_value   numeric,
  decimals    int  not null default 1 check (decimals between 0 and 3),
  shifts      text[] not null default array['pagi','sore','malam'],
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  check (shifts <@ array['pagi','sore','malam'] and cardinality(shifts) > 0),
  check (min_value is null or max_value is null or min_value <= max_value)
);

-- Indikator dipasang ke satu ruangan ATAU satu alat
create table public.indicator_targets (
  id            uuid primary key default gen_random_uuid(),
  indicator_id  uuid not null references public.indicators(id) on delete cascade,
  room_id       uuid references public.rooms(id) on delete cascade,
  equipment_id  uuid references public.equipment(id) on delete cascade,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  check (num_nonnulls(room_id, equipment_id) = 1)
);
create unique index indicator_targets_room_uq  on public.indicator_targets(indicator_id, room_id) where room_id is not null;
create unique index indicator_targets_equip_uq on public.indicator_targets(indicator_id, equipment_id) where equipment_id is not null;

create table public.indicator_readings (
  id                 bigint generated always as identity primary key,
  target_id          uuid not null references public.indicator_targets(id) on delete cascade,
  reading_date       date not null,
  shift              text not null check (shift in ('pagi','sore','malam')),
  value              numeric not null,
  is_out_of_range    boolean not null default false,
  corrective_action  text,
  initials           text not null default '',
  user_id            uuid references auth.users(id) on delete set null,
  entered_at         timestamptz not null default now(),
  is_backdated       boolean not null default false,
  unique (target_id, reading_date, shift)
);
create index readings_target_date_idx on public.indicator_readings(target_id, reading_date);

-- ---------------------------------------------------------------------
-- PUSH NOTIFICATION (Web Push per perangkat)
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- STEMPEL OTOMATIS: siapa, paraf, waktu input, susulan, di luar batas
-- (tidak bisa dipalsukan dari aplikasi)
-- ---------------------------------------------------------------------
create or replace function public.stamp_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ini text;
  d   date;
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
    select nullif(initials,'') into ini from public.profiles where id = auth.uid();
    new.initials := coalesce(ini, new.initials, '');
  end if;
  new.entered_at := now();
  if tg_table_name = 'checks' then d := new.check_date; else d := new.reading_date; end if;
  if d > public.today_wib() then
    raise exception 'Tanggal tidak boleh melebihi hari ini';
  end if;
  new.is_backdated := d < public.today_wib();
  return new;
end $$;

create trigger checks_stamp before insert or update on public.checks
  for each row execute function public.stamp_entry();

create or replace function public.check_reading_range()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ind public.indicators;
begin
  select i.* into ind from public.indicators i
    join public.indicator_targets t on t.indicator_id = i.id
   where t.id = new.target_id;
  new.is_out_of_range := (ind.min_value is not null and new.value < ind.min_value)
                      or (ind.max_value is not null and new.value > ind.max_value);
  if new.is_out_of_range and coalesce(btrim(new.corrective_action),'') = '' then
    raise exception 'Nilai di luar batas normal: tindakan korektif wajib diisi';
  end if;
  return new;
end $$;

create trigger readings_stamp before insert or update on public.indicator_readings
  for each row execute function public.stamp_entry();
create trigger readings_range before insert or update on public.indicator_readings
  for each row execute function public.check_reading_range();

-- ---------------------------------------------------------------------
-- RIWAYAT PERUBAHAN (audit log)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id            bigint generated always as identity primary key,
  table_name    text not null,
  action        text not null,
  equipment_id  uuid,
  room_id       uuid,
  old_data      jsonb,
  new_data      jsonb,
  user_id       uuid,
  user_label    text,
  created_at    timestamptz not null default now()
);
create index audit_equipment_idx on public.audit_log(equipment_id, created_at desc);
create index audit_created_idx on public.audit_log(created_at desc);

create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec   jsonb;
  eq    uuid;
  rm    uuid;
  label text;
begin
  if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
  if tg_table_name = 'rooms' then rm := (rec->>'id')::uuid;
  elsif tg_table_name = 'equipment' then eq := (rec->>'id')::uuid; rm := (rec->>'room_id')::uuid;
  elsif tg_table_name in ('activities','checks') then eq := (rec->>'equipment_id')::uuid;
  elsif tg_table_name = 'indicator_targets' then eq := (rec->>'equipment_id')::uuid; rm := (rec->>'room_id')::uuid;
  elsif tg_table_name = 'indicator_readings' then
    select t.equipment_id, t.room_id into eq, rm from public.indicator_targets t where t.id = (rec->>'target_id')::uuid;
  end if;
  select coalesce(nullif(full_name,''), email) into label from public.profiles where id = auth.uid();
  insert into public.audit_log (table_name, action, equipment_id, room_id, old_data, new_data, user_id, user_label)
  values (tg_table_name, tg_op, eq, rm,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
          auth.uid(), label);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['rooms','equipment','activities','checks','indicators','indicator_targets','indicator_readings'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.write_audit()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- STATUS JADWAL KEGIATAN (dihitung dari tanggal terakhir dikerjakan)
-- ---------------------------------------------------------------------
create view public.activity_status with (security_invoker = true) as
select
  a.id            as activity_id,
  a.equipment_id,
  e.room_id,
  a.name,
  a.interval_days,
  a.sort_order,
  last.last_done,
  coalesce(last.last_done + a.interval_days, public.today_wib()) as next_due,
  public.today_wib() - coalesce(last.last_done + a.interval_days, public.today_wib()) as days_overdue
from public.activities a
join public.equipment e on e.id = a.equipment_id and e.is_active
join public.rooms r on r.id = e.room_id and r.is_active
left join lateral (
  select max(c.check_date) as last_done
    from public.checks c
   where c.activity_id = a.id and c.status = 'done'
) last on true
where a.is_active;

-- ---------------------------------------------------------------------
-- HAK AKSES (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.rooms               enable row level security;
alter table public.equipment           enable row level security;
alter table public.activities          enable row level security;
alter table public.checks              enable row level security;
alter table public.indicators          enable row level security;
alter table public.indicator_targets   enable row level security;
alter table public.indicator_readings  enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.audit_log           enable row level security;

-- Profil: semua petugas aktif boleh melihat; ubah nama/inisial sendiri; role & status hanya admin
create policy profiles_select on public.profiles for select to authenticated using (public.is_staff() or id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
revoke update on public.profiles from authenticated;
grant update (full_name, initials) on public.profiles to authenticated;

create or replace function public.admin_set_profile(p_id uuid, p_role text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  if p_id = auth.uid() and (p_role <> 'admin' or not p_active) then
    raise exception 'Admin tidak bisa menurunkan atau menonaktifkan akunnya sendiri';
  end if;
  update public.profiles set role = p_role, is_active = p_active where id = p_id;
end $$;
grant execute on function public.admin_set_profile(uuid, text, boolean) to authenticated;

-- Master data: baca untuk petugas aktif, tulis khusus admin
do $$
declare t text;
begin
  foreach t in array array['rooms','equipment','activities','indicators','indicator_targets'] loop
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_staff())', t, t);
    execute format('create policy %I_admin_insert on public.%I for insert to authenticated with check (public.is_admin())', t, t);
    execute format('create policy %I_admin_update on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
    execute format('create policy %I_admin_delete on public.%I for delete to authenticated using (public.is_admin())', t, t);
  end loop;
end $$;

-- Ceklis & pencatatan indikator: petugas aktif boleh isi & ubah; hapus hanya isian sendiri atau admin
do $$
declare t text;
begin
  foreach t in array array['checks','indicator_readings'] loop
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_staff())', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.is_staff())', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (user_id = auth.uid() or public.is_admin())', t, t);
  end loop;
end $$;

-- Push subscription: milik sendiri
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Riwayat: dibaca petugas aktif, tidak bisa diubah dari aplikasi
create policy audit_select on public.audit_log for select to authenticated using (public.is_staff());

-- Reset ceklis satu bulan (khusus admin)
create or replace function public.reset_month(p_equipment uuid, p_year int, p_month int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Hanya admin yang boleh mereset bulan'; end if;
  delete from public.checks
   where equipment_id = p_equipment
     and check_date >= make_date(p_year, p_month, 1)
     and check_date <  (make_date(p_year, p_month, 1) + interval '1 month')::date;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.reset_month(uuid,int,int) to authenticated;

-- ---------------------------------------------------------------------
-- REALTIME (sinkron otomatis antar HP & PC)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.checks, public.indicator_readings;
