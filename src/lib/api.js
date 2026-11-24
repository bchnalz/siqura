import { supabase } from '@/lib/supabase';

/** Jalankan query Supabase; lempar error bila gagal. */
export async function rows(q) {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

/** Panggil Edge Function admin-users dengan token admin yang login. */
export async function adminUsers(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch { /* bukan JSON */ }
    throw new Error(msg);
  }
  return data;
}
