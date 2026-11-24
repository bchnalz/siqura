-- Kepatuhan ceklis harian per ruangan per tanggal (untuk dashboard).
-- daily_total = jumlah kegiatan harian (interval 1 hari) yang aktif pada tanggal itu
-- filled      = yang sudah diisi (✓ selesai atau – tidak digunakan)
create or replace function public.daily_compliance(p_from date, p_to date)
returns table (room_id uuid, day date, daily_total int, filled int)
language sql stable security invoker set search_path = public as $$
  with days as (
    select generate_series(p_from, least(p_to, public.today_wib()), interval '1 day')::date as d
  ),
  act as (
    select a.id, e.room_id, (a.created_at at time zone 'Asia/Jakarta')::date as since
      from public.activities a
      join public.equipment e on e.id = a.equipment_id and e.is_active
      join public.rooms r on r.id = e.room_id and r.is_active
     where a.is_active and a.interval_days = 1
  )
  select act.room_id, days.d, count(*)::int, count(c.id)::int
    from act
    join days on days.d >= act.since
    left join public.checks c on c.activity_id = act.id and c.check_date = days.d
   group by act.room_id, days.d
$$;
grant execute on function public.daily_compliance(date, date) to authenticated;
