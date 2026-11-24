// Uji migration di Postgres (PGlite) dengan tiruan skema auth Supabase.
// Jalankan: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = path.resolve(import.meta.dirname, '../migrations');
const db = new PGlite();

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text,
    raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  create role authenticated; create role anon;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  create publication supabase_realtime;
  create role service_role bypassrls;
  grant usage on schema auth to service_role;
  -- tiruan pg_cron & pg_net (tidak tersedia di PGlite)
  create schema cron; create table cron.job (jobname text primary key, schedule text, command text);
  create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job values (n, s, c) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command; select 1::bigint $$;
  create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n; select true $$;
  create schema net; create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ select 1::bigint $$;
`);
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^create extension .*$/gm, '-- (ekstensi ditiru di uji)');
  await db.exec(sql);
}
// Sengaja TIDAK memberi hak tabel di sini: seperti proyek Supabase baru,
// semua hak akses harus datang dari migration itu sendiri.

let passed = 0;
async function as(uid, sql, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub', '${uid}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
async function fails(promise, re, name) {
  try { await promise; } catch (e) { assert.match(e.message, re, name); passed++; return; }
  assert.fail('Seharusnya gagal: ' + name);
}
function ok(cond, name) { assert.ok(cond, name); passed++; }

const one = async (q, p) => (await db.query(q, p)).rows[0];
const admin = (await one(`insert into auth.users(email, raw_user_meta_data, raw_app_meta_data)
  values ('admin@lab.id', '{"full_name":"Admin Lab","initials":"al"}', '{"siqura_role":"admin"}') returning id`)).id;
const rina = (await one(`insert into auth.users(email, raw_user_meta_data)
  values ('rina@lab.id', '{"full_name":"Rina S","initials":"RS"}') returning id`)).id;
const dodi = (await one(`insert into auth.users(email, raw_user_meta_data)
  values ('dodi@lab.id', '{"full_name":"Dodi A","initials":"DA"}') returning id`)).id;

ok((await one(`select role, initials from profiles where id=$1`, [admin])).role === 'admin', 'role admin dari app_metadata');
ok((await one(`select initials from profiles where id=$1`, [admin])).initials === 'AL', 'inisial huruf besar');
ok((await one(`select role from profiles where id=$1`, [rina])).role === 'petugas', 'default petugas');

// Master hanya admin
await fails(as(rina, `insert into rooms(name) values ('X')`), /row-level security/, 'petugas tidak bisa tambah ruangan');
const room = (await as(admin, `insert into rooms(name) values ('Laboratorium TBC') returning id`)).rows[0].id;
const eq = (await as(admin, `insert into equipment(room_id,name,category) values ($1,'BSC-II A','Biosafety Cabinet') returning id`, [room])).rows[0].id;
const aDaily = (await as(admin, `insert into activities(equipment_id,name,interval_days) values ($1,'Disinfeksi permukaan',1) returning id`, [eq])).rows[0].id;
const aMonthly = (await as(admin, `insert into activities(equipment_id,name,interval_days) values ($1,'Cek jam lampu UV',30) returning id`, [eq])).rows[0].id;

// Ceklis: stempel paraf & user, tidak bisa dipalsukan
await as(rina, `insert into checks(equipment_id,activity_id,check_date,status,initials,user_id)
  values ($1,$2,today_wib(),'done','PALSU',$3)`, [eq, aDaily, dodi]);
let c = await one(`select initials, user_id, is_backdated from checks where activity_id=$1`, [aDaily]);
ok(c.initials === 'RS' && c.user_id === rina && c.is_backdated === false, 'paraf & user otomatis dari akun');

// Susulan (backdate) boleh, ditandai
await as(rina, `insert into checks(equipment_id,activity_id,check_date,status) values ($1,$2,today_wib()-34,'done')`, [eq, aMonthly]);
ok((await one(`select is_backdated from checks where activity_id=$1`, [aMonthly])).is_backdated === true, 'isi susulan ditandai');
await fails(as(rina, `insert into checks(equipment_id,activity_id,check_date,status) values ($1,$2,today_wib()+1,'done')`, [eq, aDaily]),
  /melebihi hari ini/, 'tanggal masa depan ditolak');

// Status jadwal dari tanggal terakhir dikerjakan
const st = (await as(rina, `select activity_id, days_overdue, next_due - today_wib() as left_days from activity_status order by interval_days`)).rows;
ok(st[0].left_days === 1, 'harian: jatuh tempo besok setelah dikerjakan hari ini');
ok(st[1].days_overdue === 4, 'bulanan: terlambat 4 hari (34 hari lalu, interval 30)');

// Hapus: hanya isian sendiri atau admin
ok((await as(dodi, `delete from checks where activity_id=$1 returning id`, [aDaily])).rows.length === 0, 'petugas lain tidak bisa hapus isian Rina');
ok((await as(rina, `delete from checks where activity_id=$1 returning id`, [aDaily])).rows.length === 1, 'Rina bisa hapus isiannya');

// Indikator
await fails(as(rina, `insert into indicators(name,unit) values ('Suhu','°C')`), /row-level security/, 'petugas tidak bisa tambah indikator');
const ind = (await as(admin, `insert into indicators(name,unit,min_value,max_value,shifts) values ('Kelembapan','%RH',40,60,'{pagi,sore,malam}') returning id`)).rows[0].id;
await fails(as(admin, `insert into indicators(name,unit,shifts) values ('X','x','{siang}')`), /check constraint/, 'shift tidak valid ditolak');
const tgt = (await as(admin, `insert into indicator_targets(indicator_id,room_id) values ($1,$2) returning id`, [ind, room])).rows[0].id;
await fails(as(admin, `insert into indicator_targets(indicator_id,room_id,equipment_id) values ($1,$2,$3)`, [ind, room, eq]), /check constraint/, 'target harus satu: ruangan atau alat');

await as(rina, `insert into indicator_readings(target_id,reading_date,shift,value) values ($1,today_wib(),'pagi',55)`, [tgt]);
await fails(as(rina, `insert into indicator_readings(target_id,reading_date,shift,value) values ($1,today_wib(),'sore',63)`, [tgt]),
  /tindakan korektif wajib/, 'di luar batas tanpa tindakan korektif ditolak');
await as(rina, `insert into indicator_readings(target_id,reading_date,shift,value,corrective_action) values ($1,today_wib(),'sore',63,'Dehumidifier dinyalakan')`, [tgt]);
const r = (await db.query(`select shift, is_out_of_range, initials from indicator_readings order by id`)).rows;
ok(r[0].is_out_of_range === false && r[1].is_out_of_range === true && r[1].initials === 'RS', 'penanda di luar batas otomatis');

// Profil: petugas tidak bisa jadi admin
await fails(as(rina, `update profiles set role='admin' where id=$1`, [rina]), /permission denied/, 'petugas tidak bisa ubah role');
await fails(as(rina, `select admin_set_profile($1,'admin',true)`, [rina]), /Hanya admin/, 'petugas tidak bisa pakai admin_set_profile');
await fails(as(admin, `select admin_set_profile($1,'petugas',true)`, [admin]), /tidak bisa menurunkan/, 'admin tidak bisa menurunkan dirinya');
await as(admin, `select admin_set_profile($1,'petugas',false)`, [dodi]);
ok((await as(dodi, `select count(*)::int n from rooms`)).rows[0].n === 0, 'petugas nonaktif tidak bisa melihat data');
await fails(as(dodi, `insert into checks(equipment_id,activity_id,check_date,status) values ($1,$2,today_wib(),'done')`, [eq, aDaily]), /row-level security/, 'petugas nonaktif tidak bisa mengisi');

// Simpan ceklis satu hari sekaligus
await db.exec(`select set_config('request.jwt.sub', '', false)`);
await as(admin, `select admin_set_profile($1,'petugas',true)`, [dodi]);
let res = (await as(rina, `select save_day_checks($1, today_wib()-1, $2::jsonb) r`,
  [eq, JSON.stringify([{ activity_id: aDaily, status: 'done' }, { activity_id: aMonthly, status: 'na' }])])).rows[0].r;
ok(res.saved === 2 && res.blocked === 0, 'save_day_checks menyimpan 2 kegiatan');
res = (await as(dodi, `select save_day_checks($1, today_wib()-1, $2::jsonb) r`,
  [eq, JSON.stringify([{ activity_id: aDaily, status: null }])])).rows[0].r;
ok(res.blocked === 1, 'mengosongkan isian petugas lain dilaporkan sebagai terblokir');
res = (await as(rina, `select save_day_checks($1, today_wib()-1, $2::jsonb) r`,
  [eq, JSON.stringify([{ activity_id: aDaily, status: null }])])).rows[0].r;
ok(res.blocked === 0 && (await one(`select count(*)::int n from checks where activity_id=$1 and check_date=today_wib()-1`, [aDaily])).n === 0, 'isian sendiri bisa dikosongkan');
const otherEq = (await as(admin, `insert into equipment(room_id,name) values ($1,'Sentrifus') returning id`, [room])).rows[0].id;
await fails(as(rina, `select save_day_checks($1, today_wib(), $2::jsonb)`, [otherEq, JSON.stringify([{ activity_id: aDaily, status: 'done' }])]),
  /tidak sesuai/, 'kegiatan alat lain ditolak');

// Kepatuhan harian
const comp = (await as(rina, `select * from daily_compliance(today_wib()-2, today_wib()) order by day`)).rows;
ok(comp.length === 1 && comp[0].daily_total === 1, 'kegiatan harian baru dihitung mulai tanggal dibuat');

// Reset bulan & audit
await fails(as(rina, `select reset_month($1,2026,1)`, [eq]), /Hanya admin/, 'reset hanya admin');
const audit = (await as(rina, `select table_name, action, user_label from audit_log order by id`)).rows;
ok(audit.some((a) => a.table_name === 'checks' && a.action === 'DELETE' && a.user_label === 'Rina S'), 'riwayat mencatat penghapusan');
await fails(as(admin, `delete from audit_log`), /permission denied/, 'riwayat tidak bisa dihapus, bahkan oleh admin');

// Notifikasi: langganan perangkat berpindah akun
await db.exec(`grant usage on schema public to service_role; grant usage on schema cron, net to service_role; grant select, insert, update, delete on cron.job to service_role;`);
await as(rina, `select save_push_subscription('https://push.example/abc', 'p', 'a', 'iPhone')`);
await as(admin, `select save_push_subscription('https://push.example/abc', 'p2', 'a2', 'iPhone')`);
const subs = (await db.query(`select user_id from push_subscriptions where endpoint = 'https://push.example/abc'`)).rows;
ok(subs.length === 1 && subs[0].user_id === admin, 'satu perangkat = satu langganan, ikut akun terakhir');
await fails(as(rina, `select * from app_secrets`), /permission denied/, 'rahasia aplikasi tidak bisa dibaca petugas');
await fails(as(rina, `select reminder_summary('pagi')`), /permission denied/, 'ringkasan pengingat hanya untuk server');
await fails(as(rina, `select configure_reminders('x','y')`), /permission denied/, 'jadwal pengingat hanya untuk server');
async function asService(sql, params) {
  await db.exec(`set role service_role`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
const sum = (await asService(`select reminder_summary('malam') s`)).rows[0].s;
ok(sum.pending === 1 && sum.pending_locations[0] === 'Laboratorium TBC' && sum.due >= 1, 'ringkasan: indikator malam belum dicatat & kegiatan jatuh tempo');
await asService(`select configure_reminders('https://x.supabase.co/functions/v1/push', 'rahasia')`);
await asService(`select configure_reminders('https://x.supabase.co/functions/v1/push', 'rahasia')`);
const jobs = (await db.query(`select jobname, schedule, command from cron.job order by jobname`)).rows;
ok(jobs.length === 2 && jobs[0].schedule === '0 1 * * *' && jobs[1].schedule === '0 8 * * *' && jobs[1].command.includes("'sore'") && jobs[0].command.includes('x-siqura-cron'),
  'jadwal 08.00 & 15.00 WIB terpasang sekali (idempoten)');

// Tanpa login (anon) tidak bisa membaca apa pun
await db.exec('set role anon');
await fails(db.query('select * from rooms'), /permission denied/, 'anon tidak bisa membaca ruangan');
await db.exec('reset role');

console.log(`✓ ${passed} uji database lulus`);
