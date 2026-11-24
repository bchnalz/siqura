-- Hak akses tabel untuk pengguna yang login (role "authenticated").
-- Proyek Supabase baru tidak lagi memberikannya otomatis, jadi diberikan
-- di sini secara eksplisit. Siapa boleh melihat/mengubah baris yang mana
-- tetap diatur oleh RLS. Pengunjung tanpa login (anon) tidak diberi apa pun.

grant usage on schema public to authenticated;

-- Profil: baca semua; ubah hanya nama & inisial (role/status lewat admin_set_profile)
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, initials) on public.profiles to authenticated;

-- Data master (tulis dibatasi admin oleh RLS)
grant select, insert, update, delete on
  public.rooms, public.equipment, public.activities,
  public.indicators, public.indicator_targets
  to authenticated;

-- Pencatatan
grant select, insert, update, delete on public.checks, public.indicator_readings to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Riwayat & status jadwal: hanya baca
grant select on public.audit_log to authenticated;
grant select on public.activity_status to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- Fungsi yang dipanggil aplikasi
grant execute on function
  public.today_wib(),
  public.is_admin(),
  public.is_staff(),
  public.admin_set_profile(uuid, text, boolean),
  public.reset_month(uuid, int, int),
  public.save_day_checks(uuid, date, jsonb),
  public.daily_compliance(date, date)
  to authenticated;

-- Tanpa login: tidak ada akses langsung ke data
revoke all on all tables in schema public from anon;
revoke execute on function
  public.admin_set_profile(uuid, text, boolean),
  public.reset_month(uuid, int, int),
  public.save_day_checks(uuid, date, jsonb),
  public.daily_compliance(date, date)
  from anon, public;
