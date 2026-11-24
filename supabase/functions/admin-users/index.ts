// Edge Function: admin membuat akun petugas & mengatur ulang kata sandi.
// Dipanggil dari aplikasi dengan token admin yang sedang login.
// Kunci service role hanya ada di server Supabase, tidak pernah di aplikasi.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Pastikan pemanggil adalah admin aktif (dicek dengan hak aksesnya sendiri)
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: isAdmin, error: adminErr } = await asCaller.rpc('is_admin');
  if (adminErr || isAdmin !== true) return json({ error: 'Hanya admin yang boleh mengelola akun' }, 403);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Data tidak valid' }, 400); }

  const action = String(body.action ?? '');
  const password = String(body.password ?? '');
  if (password && password.length < 8) return json({ error: 'Kata sandi minimal 8 karakter' }, 400);

  if (action === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const fullName = String(body.full_name ?? '').trim();
    const initials = String(body.initials ?? '').trim().toUpperCase();
    const role = body.role === 'admin' ? 'admin' : 'petugas';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Email tidak valid' }, 400);
    if (!fullName || !initials) return json({ error: 'Nama dan inisial wajib diisi' }, 400);
    if (!password) return json({ error: 'Kata sandi wajib diisi' }, 400);

    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName, initials },
      app_metadata: { siqura_role: role },
    });
    if (error) {
      const dup = /already.*registered|exists/i.test(error.message);
      return json({ error: dup ? 'Email sudah terdaftar' : error.message }, dup ? 409 : 400);
    }
    return json({ id: data.user.id });
  }

  if (action === 'reset_password') {
    const id = String(body.user_id ?? '');
    if (!id || !password) return json({ error: 'Akun dan kata sandi baru wajib diisi' }, 400);
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Aksi tidak dikenal' }, 400);
});
