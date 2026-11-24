// Edge Function "push": push notification SiQura.
//   public_key → kunci publik VAPID untuk berlangganan di HP
//   bootstrap  → buat kunci VAPID & rahasia penjadwal (sekali), pasang jadwal pg_cron
//   send       → dipanggil pg_cron (08.00 & 15.00 WIB), kirim pengingat ke petugas
//   test       → kirim notifikasi uji ke perangkat milik pengguna yang login
// Kunci rahasia dibuat & disimpan di server; tidak pernah melewati GitHub atau chat.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const SHIFT_LABEL: Record<string, string> = { pagi: 'pagi', sore: 'siang', malam: 'malam' };

function randomToken(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getSecret(key: string) {
  const { data, error } = await db.from('app_secrets').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value as string | undefined;
}

/** Buat kunci VAPID & rahasia penjadwal bila belum ada (aman dipanggil berulang). */
async function ensureKeys() {
  let pub = await getSecret('vapid_public');
  let priv = await getSecret('vapid_private');
  let cron = await getSecret('cron_secret');
  const rows = [];
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey; priv = k.privateKey;
    rows.push({ key: 'vapid_public', value: pub }, { key: 'vapid_private', value: priv });
  }
  if (!cron) { cron = randomToken(); rows.push({ key: 'cron_secret', value: cron }); }
  if (rows.length) {
    // ignoreDuplicates: bila dua pemanggilan bersamaan, nilai pertama yang dipakai
    const { error } = await db.from('app_secrets').upsert(rows, { onConflict: 'key', ignoreDuplicates: true });
    if (error) throw error;
    pub = (await getSecret('vapid_public'))!; priv = (await getSecret('vapid_private'))!; cron = (await getSecret('cron_secret'))!;
  }
  return { pub: pub!, priv: priv!, cron: cron! };
}

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

/** Kirim ke banyak perangkat; langganan kedaluwarsa (404/410) dihapus. */
async function sendTo(subs: Sub[], payload: Record<string, unknown>) {
  const { pub, priv } = await ensureKeys();
  const subject = URL_.startsWith('https://') ? URL_ : 'mailto:siqura@example.com';
  let sent = 0, failed = 0;
  const gone: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      const d = webpush.generateRequestDetails(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 6 * 3600, urgency: 'high', vapidDetails: { subject, publicKey: pub, privateKey: priv } },
      );
      const res = await fetch(d.endpoint, { method: d.method, headers: d.headers, body: d.body });
      if (res.status === 404 || res.status === 410) gone.push(s.id);
      if (res.ok) sent++; else failed++;
      await res.body?.cancel();
    } catch (_) {
      failed++;
    }
  }));
  if (gone.length) await db.from('push_subscriptions').delete().in('id', gone);
  return { sent, failed, removed: gone.length };
}

function reminderText(s: { due: number; late: number; pending: number; pending_locations: string[] }) {
  const parts: string[] = [];
  if (s.due) parts.push(`${s.due} kegiatan alat perlu dikerjakan${s.late ? ` (${s.late} terlambat)` : ''}`);
  if (s.pending) {
    const locs = s.pending_locations.slice(0, 3).join(', ') + (s.pending_locations.length > 3 ? ', …' : '');
    parts.push(`${s.pending} indikator belum dicatat: ${locs}`);
  }
  return parts.join(' · ');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* kosong */ }
  const action = String(body.action ?? '');

  try {
    if (action === 'public_key') {
      return json({ publicKey: (await ensureKeys()).pub });
    }

    if (action === 'bootstrap') {
      const { cron } = await ensureKeys();
      const { error } = await db.rpc('configure_reminders', { p_url: `${URL_}/functions/v1/push`, p_secret: cron });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'send') {
      const { cron } = await ensureKeys();
      if (req.headers.get('x-siqura-cron') !== cron) return json({ error: 'Tidak diizinkan' }, 401);
      const shift = String(body.shift ?? '');
      if (!['pagi', 'sore', 'malam'].includes(shift)) return json({ error: 'Shift tidak valid' }, 400);

      const { data: summary, error: sErr } = await db.rpc('reminder_summary', { p_shift: shift });
      if (sErr) throw sErr;
      // cegah kiriman ganda untuk shift & tanggal yang sama
      const { error: logErr } = await db.from('notification_log').insert({ kind: 'shift', ref_date: summary.date, shift, payload: summary });
      if (logErr) return json({ skipped: 'sudah dikirim', detail: logErr.message });

      const text = reminderText(summary);
      if (!text) return json({ skipped: 'tidak ada yang perlu diingatkan', summary });

      const { data: staff, error: pErr } = await db.from('profiles').select('id').eq('role', 'petugas').eq('is_active', true);
      if (pErr) throw pErr;
      const ids = staff.map((p) => p.id);
      const { data: subs, error: subErr } = ids.length
        ? await db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').in('user_id', ids)
        : { data: [], error: null };
      if (subErr) throw subErr;

      const result = await sendTo(subs as Sub[], {
        title: `SiQura · Pengingat shift ${SHIFT_LABEL[shift]}`,
        body: text,
        tag: `siqura-${summary.date}-${shift}`,
        url: summary.pending && !summary.due ? '/indikator' : '/',
      });
      await db.from('notification_log').update({ sent: result.sent, failed: result.failed })
        .eq('kind', 'shift').eq('ref_date', summary.date).eq('shift', shift);
      return json({ ...result, summary });
    }

    if (action === 'test') {
      const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: u } = await asUser.auth.getUser();
      if (!u?.user) return json({ error: 'Silakan masuk dulu' }, 401);
      const { data: subs, error } = await db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').eq('user_id', u.user.id);
      if (error) throw error;
      if (!subs.length) return json({ error: 'Notifikasi belum diaktifkan di perangkat ini' }, 400);
      const result = await sendTo(subs as Sub[], {
        title: 'SiQura · Notifikasi aktif',
        body: 'Pengingat shift akan muncul seperti ini pukul 08.00 dan 15.00.',
        tag: 'siqura-test',
        url: '/akun',
      });
      return json(result);
    }

    return json({ error: 'Aksi tidak dikenal' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});
