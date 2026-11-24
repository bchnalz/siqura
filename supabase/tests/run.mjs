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

// Hapus kegiatan: hanya admin; isian ikut terhapus tetapi tercatat di riwayat
const before = (await one(`select count(*)::int n from checks where activity_id=$1`, [aMonthly])).n;
ok((await as(rina, `delete from activities where id=$1 returning id`, [aMonthly])).rows.length === 0, 'petugas tidak bisa menghapus kegiatan');
ok((await as(admin, `delete from activities where id=$1 returning id`, [aMonthly])).rows.length === 1, 'admin bisa menghapus kegiatan');
ok((await one(`select count(*)::int n from checks where activity_id=$1`, [aMonthly])).n === 0 && before > 0, 'isian kegiatan yang dihapus ikut terhapus');
ok((await one(`select count(*)::int n from audit_log where table_name='activities' and action='DELETE' and old_data->>'id'=$1`, [aMonthly])).n === 1, 'penghapusan kegiatan tercatat di riwayat');

// ---------------- Master Jenis Alat ----------------
await fails(as(rina, `insert into equipment_types(name) values ('X')`), /row-level security/, 'petugas tidak bisa membuat jenis alat');
const tInk = (await as(admin, `insert into equipment_types(name, category) values ('Inkubator','Inkubator') returning id`)).rows[0].id;
const ta1 = (await as(admin, `insert into type_activities(type_id,name,interval_days,sort_order) values ($1,'Cek suhu display',1,1) returning id`, [tInk])).rows[0].id;
const ta2 = (await as(admin, `insert into type_activities(type_id,name,interval_days,sort_order) values ($1,'Bersihkan rak',30,2) returning id`, [tInk])).rows[0].id;
const indInk = (await as(admin, `insert into indicators(name,unit,min_value,max_value,shifts) values ('Suhu inkubator','°C',35,37,'{pagi,sore}') returning id`)).rows[0].id;
await as(admin, `insert into type_indicators(type_id,indicator_id) values ($1,$2)`, [tInk, indInk]);
const roomB = (await as(admin, `insert into rooms(name) values ('Lab Bakteriologi') returning id`)).rows[0].id;
// unit baru dari jenis: kegiatan & indikator ikut otomatis
const u1 = (await as(admin, `insert into equipment(room_id,name,category,type_id) values ($1,'Inkubator','Inkubator',$2) returning id`, [room, tInk])).rows[0].id;
const u2 = (await as(admin, `insert into equipment(room_id,name,category,type_id) values ($1,'Inkubator','Inkubator',$2) returning id`, [roomB, tInk])).rows[0].id;
const acts = async (u) => (await db.query(`select name, interval_days, is_active from activities where equipment_id=$1 order by sort_order`, [u])).rows;
ok((await acts(u1)).length === 2 && (await acts(u2)).length === 2, 'unit baru langsung punya kegiatan dari jenis');
ok((await one(`select count(*)::int n from indicator_targets where equipment_id=$1 and indicator_id=$2 and is_active and from_type`, [u2, indInk])).n === 1, 'unit baru langsung punya indikator dari jenis');
// ubah di jenis → semua unit ikut
await as(admin, `update type_activities set interval_days=14, name='Bersihkan rak & dinding' where id=$1`, [ta2]);
ok((await acts(u1))[1].interval_days === 14 && (await acts(u2))[1].name === 'Bersihkan rak & dinding', 'perubahan kegiatan jenis ikut ke semua unit');
await as(admin, `insert into type_activities(type_id,name,interval_days,sort_order) values ($1,'Kalibrasi',365,3)`, [tInk]);
ok((await acts(u1)).length === 3 && (await acts(u2)).length === 3, 'kegiatan baru di jenis ikut ke semua unit');
// unit boleh punya kegiatan tambahan sendiri; tidak ikut ke unit lain
await as(admin, `insert into activities(equipment_id,name,interval_days) values ($1,'Ganti air wadah CO2',7)`, [u1]);
ok((await acts(u1)).length === 4 && (await acts(u2)).length === 3, 'kegiatan khusus unit tidak menyebar');
// hapus kegiatan jenis: unit yang sudah diisi → nonaktif (riwayat aman); yang belum → terhapus
const u1ta1 = (await one(`select id from activities where equipment_id=$1 and type_activity_id=$2`, [u1, ta1])).id;
await as(rina, `insert into checks(equipment_id,activity_id,check_date,status) values ($1,$2,today_wib(),'done')`, [u1, u1ta1]);
await as(admin, `delete from type_activities where id=$1`, [ta1]);
ok((await one(`select is_active from activities where id=$1`, [u1ta1])).is_active === false, 'kegiatan jenis dihapus: unit yang sudah diisi dinonaktifkan');
ok((await one(`select count(*)::int n from checks where activity_id=$1`, [u1ta1])).n === 1, 'riwayat ceklis tetap ada');
ok((await one(`select count(*)::int n from activities where equipment_id=$1 and name='Cek suhu display'`, [u2])).n === 0, 'kegiatan jenis dihapus: unit yang belum diisi ikut terhapus');
// lepas indikator dari jenis → nonaktif di unit
await as(admin, `delete from type_indicators where type_id=$1 and indicator_id=$2`, [tInk, indInk]);
ok((await one(`select count(*)::int n from indicator_targets where indicator_id=$1 and is_active`, [indInk])).n === 0, 'indikator dilepas dari jenis → nonaktif di semua unit');
// kategori jenis berubah → unit ikut
await as(admin, `update equipment_types set category='Inkubator CO2' where id=$1`, [tInk]);
ok((await one(`select category from equipment where id=$1`, [u2])).category === 'Inkubator CO2', 'kategori jenis ikut ke unit');
// jadikan alat lama sebagai jenis
await fails(as(rina, `select create_type_from_equipment($1,'BSC')`, [eq]), /Hanya admin/, 'petugas tidak bisa membuat jenis dari alat');
const before2 = (await acts(eq)).filter((a) => a.is_active).length;
const tBsc = (await as(admin, `select create_type_from_equipment($1,'Biosafety Cabinet II') id`, [eq])).rows[0].id;
ok((await one(`select count(*)::int n from type_activities where type_id=$1`, [tBsc])).n === before2 && before2 > 0, 'jenis dibuat dari kegiatan alat yang ada');
ok((await one(`select count(*)::int n from activities where equipment_id=$1 and is_active`, [eq])).n === before2, 'alat asal tidak mendapat kegiatan ganda');
const u3 = (await as(admin, `insert into equipment(room_id,name,type_id) values ($1,'BSC-II B',$2) returning id`, [roomB, tBsc])).rows[0].id;
ok((await acts(u3)).length === before2, 'unit baru dari jenis hasil konversi mendapat kegiatan yang sama');
await fails(as(admin, `select create_type_from_equipment($1,'X')`, [eq]), /sudah punya jenis/, 'alat yang sudah berjenis tidak bisa dikonversi lagi');

// Alat lama (diisi manual) dipasangkan ke jenis: kegiatan bernama sama disambungkan, tidak ganda
const old = (await as(admin, `insert into equipment(room_id,name) values ($1,'Inkubator lama') returning id`, [roomB])).rows[0].id;
const oldAct = (await as(admin, `insert into activities(equipment_id,name,interval_days) values ($1,'  bersihkan rak & DINDING dalam ',30) returning id`, [old])).rows[0].id;
await as(admin, `insert into activities(equipment_id,name,interval_days) values ($1,'Cek kipas',7)`, [old]);
await as(rina, `insert into checks(equipment_id,activity_id,check_date,status) values ($1,$2,today_wib(),'done')`, [old, oldAct]);
await as(admin, `update type_activities set name='Bersihkan rak & dinding dalam' where id=$1`, [ta2]);
await as(admin, `update equipment set type_id=$1 where id=$2`, [tInk, old]);
const linked = (await db.query(`select id, name, interval_days, type_activity_id from activities where equipment_id=$1 and is_active order by sort_order, name`, [old])).rows;
ok(linked.filter((a) => /rak/i.test(a.name)).length === 1, 'kegiatan bernama sama tidak menjadi ganda');
const lk = linked.find((a) => a.id === oldAct);
ok(lk && lk.type_activity_id === ta2 && lk.interval_days === 14 && lk.name === 'Bersihkan rak & dinding dalam', 'kegiatan lama disambungkan ke jenis & mengikuti nama/interval jenis');
ok((await one(`select count(*)::int n from checks where activity_id=$1`, [oldAct])).n === 1, 'riwayat kegiatan lama tetap tersambung');
ok(linked.some((a) => a.name === 'Cek kipas' && a.type_activity_id === null), 'kegiatan yang tidak ada di jenis tetap sebagai kegiatan khusus unit');
// kegiatan baru di jenis dengan nama yang sudah ada di unit → disambungkan juga
await as(admin, `insert into activities(equipment_id,name,interval_days) values ($1,'Uji kontaminasi',30)`, [u2]);
await as(admin, `insert into type_activities(type_id,name,interval_days,sort_order) values ($1,'Uji Kontaminasi',30,9)`, [tInk]);
ok((await one(`select count(*)::int n from activities where equipment_id=$1 and lower(name)='uji kontaminasi'`, [u2])).n === 1, 'kegiatan jenis baru menyambung ke kegiatan unit bernama sama');

// Tanpa login (anon) tidak bisa membaca apa pun
await db.exec('set role anon');
await fails(db.query('select * from rooms'), /permission denied/, 'anon tidak bisa membaca ruangan');
await db.exec('reset role');

console.log(`✓ ${passed} uji database lulus`);
