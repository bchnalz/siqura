# SiQura — Sistem QR Ruangan dan Alat

Laboratorium Mikrobiologi Klinik dan Biomolekuler.

Aplikasi PWA (bisa dipasang di HP) untuk:
- ceklis pemeliharaan alat lewat scan QR, dengan jadwal berbasis **hari** (1 = harian, 7 = mingguan, 30 = bulanan, 365 = tahunan, atau angka bebas), dihitung dari tanggal terakhir dikerjakan
- pencatatan indikator ruangan/alat (suhu, tekanan, kelembapan, dll.) **pagi · sore · malam**, dengan batas normal, tindakan korektif wajib bila di luar batas, dan grafik
- riwayat perubahan (siapa, apa, kapan) untuk audit/akreditasi
- push notification pengingat

Teknologi: React + Vite + Tailwind, Supabase (database, login, Edge Functions), Vercel (hosting).

---

## Status pengerjaan

| Tahap | Isi | Status |
|---|---|---|
| 1 | Database, keamanan, login, Beranda, daftar alat, link QR, PWA | ✅ |
| 2 | Ceklis alat + matriks bulanan + riwayat, catat indikator + grafik, scan QR di aplikasi, simpan offline | ✅ |
| 3 | Kelola master & akun (admin), kartu QR, cetak A4, dashboard desktop | ⏳ |
| 4 | Push notification pengingat | ⏳ |

---

## Panduan pemasangan (sekali saja)

### 1. Database Supabase — otomatis

Repo ini sudah memakai tiga secret di GitHub (*Settings → Secrets and variables → Actions*):
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`.

Setiap ada perubahan di folder `supabase/`, workflow **Deploy Supabase** di tab **Actions** akan menguji lalu memasang database & Edge Function. Pastikan hasilnya centang hijau.

### 2. Matikan pendaftaran bebas

Supabase → **Authentication → Sign In / Providers** → matikan **Allow new users to sign up**.
Akun hanya dibuat oleh admin.

### 3. Buat akun admin pertama

1. Supabase → **Authentication → Users → Add user → Create new user**. Isi email & kata sandi, centang **Auto Confirm User**.
2. Supabase → **SQL Editor** → jalankan (ganti isinya):

```sql
update public.profiles
   set role = 'admin', full_name = 'Nama Lengkap', initials = 'NL'
 where email = 'email.admin@contoh.com';
```

Akun petugas berikutnya dibuat admin dari dalam aplikasi (tahap 3).

### 4. Hosting di Vercel

1. vercel.com → **Add New → Project** → pilih repo `siqura` → Framework: **Vite**.
2. **Environment Variables** (ambil dari Supabase → Project Settings → API):
   - `VITE_SUPABASE_URL` = `https://<PROJECT_ID>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = anon / publishable key
3. **Deploy**. Setiap push ke `main` akan deploy ulang otomatis.
4. Supabase → **Authentication → URL Configuration** → **Site URL** = alamat Vercel (mis. `https://siqura.vercel.app`).

> Jangan pernah memasang *service role key* di Vercel atau di kode.

### 5. Link QR

Setiap alat punya link `https://<alamat-aplikasi>/q?eq=<id-alat>`.
Format lama `?room=<nama ruangan>&eq=<nama alat>` juga dikenali.

---

## Pengembangan

```bash
cp .env.example .env.local   # isi URL & anon key Supabase
npm install
npm run dev        # jalankan lokal
npm run lint       # cek kode
npm test           # uji logika aplikasi
npm run test:db    # uji database (hak akses, jadwal, indikator) tanpa Supabase
npm run build
```

## Struktur

```
src/
  pages/            halaman (Login, Beranda, Alat, Akun, …)
  features/         logika per fitur (mis. home/summary.js)
  components/       UI & layout (MobileShell, InstallHint)
  hooks/            useAuth, useRealtime
  lib/              supabase client, tanggal & shift WIB
  sw.js             service worker (offline + push)
supabase/
  migrations/       skema database, RLS, audit
  functions/        Edge Function admin-users (buat akun, reset sandi)
  tests/run.mjs     uji database di PGlite
.github/workflows/  CI & deploy Supabase
```

## Aturan penting di database

- Paraf, akun pengisi, dan waktu input diisi otomatis dari akun yang login (tidak bisa dipalsukan).
- Isi susulan (tanggal mundur) boleh dan ditandai `is_backdated`; tanggal masa depan ditolak.
- Nilai indikator di luar batas wajib disertai tindakan korektif.
- Petugas hanya bisa menghapus isiannya sendiri; admin bisa semua. Riwayat tidak bisa diubah siapa pun.
- Shift: Pagi 06.00–13.59, Sore 14.00–20.59, Malam 21.00–05.59 (WIB).
