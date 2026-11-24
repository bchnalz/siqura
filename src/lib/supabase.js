import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = Boolean(url && key);

export const supabase = isConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'siqura-auth' } })
  : null;

/** Ubah error Supabase/Postgres menjadi pesan yang mudah dipahami petugas. */
export function friendlyError(error) {
  const msg = error?.message ?? String(error ?? '');
  if (/Invalid login credentials/i.test(msg)) return 'Email atau kata sandi salah.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Tidak ada koneksi internet. Coba lagi sebentar.';
  if (/row-level security/i.test(msg)) return 'Anda tidak memiliki izin untuk tindakan ini.';
  if (/JWT expired/i.test(msg)) return 'Sesi berakhir, silakan masuk lagi.';
  return msg || 'Terjadi kesalahan.';
}
