-- 1) Keterangan per indikator (tampil di bawah grafik pemantauan & formulir cetak),
--    mis. "Suhu normal lemari es 2–8 °C. Jika di luar rentang: ..."
alter table public.indicators add column if not exists notes text;

-- 2) Pengingat shift sore pukul 20.00 WIB (petugas sore biasa mengisi di akhir shift).
--    Pagi tetap 08.00 WIB. Waktu cron dalam UTC: 01.00 UTC = 08.00 WIB, 13.00 UTC = 20.00 WIB.
create or replace function public.configure_reminders(p_url text, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
declare
  j text;
  cmd text := $c$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-siqura-cron',%L), body := jsonb_build_object('action','send','shift',%L))$c$;
begin
  for j in select jobname from cron.job where jobname like 'siqura-%' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule('siqura-pagi', '0 1 * * *',  format(cmd, p_url, p_secret, 'pagi'));
  perform cron.schedule('siqura-sore', '0 13 * * *', format(cmd, p_url, p_secret, 'sore'));
end $$;
