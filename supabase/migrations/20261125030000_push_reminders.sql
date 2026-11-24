-- =====================================================================
--  Push notification pengingat shift
--  - 08.00 WIB (1 jam setelah shift pagi 07.00)
--  - 15.00 WIB (1 jam setelah shift siang 14.00)
--  Penerima: akun petugas aktif yang mengaktifkan notifikasi di HP-nya.
--  Kunci VAPID & rahasia penjadwal dibuat otomatis oleh Edge Function
--  "push" dan disimpan di app_secrets (hanya bisa dibaca service role).
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Shift pagi mulai 07.00: catatan malam sebelum 07.00 milik tanggal kemarin
create or replace function public.stamp_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ini     text;
  d       date;
  current date := public.today_wib();
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
    select nullif(initials,'') into ini from public.profiles where id = auth.uid();
    new.initials := coalesce(ini, new.initials, '');
  end if;
  new.entered_at := now();
  if tg_table_name = 'checks' then
    d := new.check_date;
  else
    d := new.reading_date;
    if new.shift = 'malam' and extract(hour from now() at time zone 'Asia/Jakarta') < 7 then
      current := current - 1;
    end if;
  end if;
  if d > public.today_wib() then
    raise exception 'Tanggal tidak boleh melebihi hari ini';
  end if;
  new.is_backdated := d < current;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Rahasia aplikasi (kunci VAPID, rahasia penjadwal) — hanya service role
-- ---------------------------------------------------------------------
create table public.app_secrets (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
grant select, insert, update on public.app_secrets to service_role;

-- Catatan pengiriman (mencegah kiriman ganda bila jadwal terpanggil dua kali)
create table public.notification_log (
  id          bigint generated always as identity primary key,
  kind        text not null,
  ref_date    date not null,
  shift       text not null default '',
  sent        int  not null default 0,
  failed      int  not null default 0,
  payload     jsonb,
  created_at  timestamptz not null default now(),
  unique (kind, ref_date, shift)
);
alter table public.notification_log enable row level security;
create policy notification_log_admin on public.notification_log for select to authenticated using (public.is_admin());
grant select on public.notification_log to authenticated;
grant select, insert, update on public.notification_log to service_role;

-- Edge Function memakai service role: beri hak yang dibutuhkan saja
grant select on public.profiles to service_role;
grant select, delete on public.push_subscriptions to service_role;

-- ---------------------------------------------------------------------
-- Simpan langganan notifikasi perangkat (HP bisa berganti akun)
-- ---------------------------------------------------------------------
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Akun tidak aktif'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300));
end $$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Ringkasan untuk isi pengingat satu shift
-- ---------------------------------------------------------------------
create or replace function public.reminder_summary(p_shift text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d date := public.today_wib();
  result jsonb;
begin
  if p_shift = 'malam' and extract(hour from now() at time zone 'Asia/Jakarta') < 7 then d := d - 1; end if;
  with pending as (
    select coalesce(r.name, e.name) as location
      from public.indicator_targets t
      join public.indicators i on i.id = t.indicator_id and i.is_active
      left join public.rooms r on r.id = t.room_id
      left join public.equipment e on e.id = t.equipment_id
     where t.is_active
       and p_shift = any(i.shifts)
       and coalesce(r.is_active, e.is_active)
       and not exists (select 1 from public.indicator_readings x
                        where x.target_id = t.id and x.reading_date = d and x.shift = p_shift)
  )
  select jsonb_build_object(
    'date', d,
    'shift', p_shift,
    'due', (select count(*) from public.activity_status s where s.next_due <= public.today_wib() and s.last_done is distinct from public.today_wib()),
    'late', (select count(*) from public.activity_status s where s.days_overdue > 0),
    'pending', (select count(*) from pending),
    'pending_locations', (select coalesce(jsonb_agg(distinct location), '[]'::jsonb) from pending)
  ) into result;
  return result;
end $$;
revoke execute on function public.reminder_summary(text) from public, anon, authenticated;
grant execute on function public.reminder_summary(text) to service_role;

-- ---------------------------------------------------------------------
-- Pasang jadwal pengingat (dipanggil Edge Function "push" saat bootstrap)
-- Waktu cron dalam UTC: 01.00 UTC = 08.00 WIB, 08.00 UTC = 15.00 WIB
-- ---------------------------------------------------------------------
create or replace function public.configure_reminders(p_url text, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
declare
  j text;
  cmd text := $c$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-siqura-cron',%L), body := jsonb_build_object('action','send','shift',%L))$c$;
begin
  for j in select jobname from cron.job where jobname like 'siqura-%' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule('siqura-pagi',  '0 1 * * *', format(cmd, p_url, p_secret, 'pagi'));
  perform cron.schedule('siqura-siang', '0 8 * * *', format(cmd, p_url, p_secret, 'sore'));
end $$;
revoke execute on function public.configure_reminders(text, text) from public, anon, authenticated;
grant execute on function public.configure_reminders(text, text) to service_role;
