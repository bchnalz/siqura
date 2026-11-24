-- Simpan ceklis satu alat untuk satu tanggal sekaligus (atomik).
-- p_items: [{"activity_id": "...", "status": "done" | "na" | null}]
--   status null = kosongkan (hapus isian tanggal itu).
-- Berjalan dengan hak akses pemanggil (RLS tetap berlaku).
-- Mengembalikan jumlah yang tersimpan & isian petugas lain yang tidak bisa dihapus.
create or replace function public.save_day_checks(p_equipment uuid, p_date date, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  it        jsonb;
  act       uuid;
  st        text;
  saved     int := 0;
  blocked   int := 0;
  n         int;
begin
  if not public.is_staff() then raise exception 'Akun tidak aktif'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    act := (it->>'activity_id')::uuid;
    st  := nullif(it->>'status', '');
    if not exists (select 1 from public.activities a where a.id = act and a.equipment_id = p_equipment) then
      raise exception 'Kegiatan tidak sesuai dengan alat';
    end if;
    if st is null then
      delete from public.checks where activity_id = act and check_date = p_date;
      get diagnostics n = row_count;
      if n = 0 and exists (select 1 from public.checks where activity_id = act and check_date = p_date) then
        blocked := blocked + 1;
      end if;
    else
      insert into public.checks (equipment_id, activity_id, check_date, status)
      values (p_equipment, act, p_date, st)
      on conflict (activity_id, check_date) do update set status = excluded.status
        where public.checks.status is distinct from excluded.status;
      saved := saved + 1;
    end if;
  end loop;
  return jsonb_build_object('saved', saved, 'blocked', blocked);
end $$;

grant execute on function public.save_day_checks(uuid, date, jsonb) to authenticated;

-- Shift malam lewat tengah malam (00.00–05.59) dicatat pada tanggal malam itu
-- dimulai, jadi tidak dihitung sebagai isian susulan.
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
    if new.shift = 'malam' and extract(hour from now() at time zone 'Asia/Jakarta') < 6 then
      current := current - 1;
    end if;
  end if;
  if d > public.today_wib() then
    raise exception 'Tanggal tidak boleh melebihi hari ini';
  end if;
  new.is_backdated := d < current;
  return new;
end $$;
