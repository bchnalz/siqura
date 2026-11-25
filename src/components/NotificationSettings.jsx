import { useEffect, useState } from 'react';
import { Bell, BellOff, Share } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { currentSubscription, disablePush, enablePush, pushSupport, sendTestPush } from '@/lib/push';
import { friendlyError } from '@/lib/supabase';
import { Alert, Button, Card } from '@/components/ui';

/** Pengaturan notifikasi perangkat ini (di halaman Akun). */
export default function NotificationSettings() {
  const { isAdmin } = useAuth();
  const [support] = useState(pushSupport);
  const [on, setOn] = useState(null); // null = memeriksa
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    currentSubscription().then((s) => alive && setOn(Boolean(s))).catch(() => alive && setOn(false));
    return () => { alive = false; };
  }, []);

  async function act(fn, okText) {
    setBusy(true); setMsg(null);
    try { await fn(); if (okText) setMsg({ tone: 'ok', text: okText }); }
    catch (e) { setMsg({ tone: 'bad', text: friendlyError(e) }); }
    finally { setBusy(false); }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          {on ? <Bell size={20} aria-hidden="true" /> : <BellOff size={20} aria-hidden="true" />}
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-bold">Notifikasi pengingat</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            Pukul 08.00 (shift pagi) dan 20.00 (shift sore): kegiatan alat yang jatuh tempo dan indikator yang belum dicatat.
            {isAdmin && ' Pengingat terjadwal dikirim ke akun petugas; admin bisa memakai kirim tes.'}
          </p>
        </div>
      </div>

      {support === 'ios-install' && (
        <Alert tone="brand">
          <span className="flex flex-col gap-1">
            <span className="font-bold">Di iPhone, pasang SiQura ke layar utama dulu</span>
            <span className="font-normal">Buka di Safari, ketuk <Share size={14} className="inline" aria-label="Bagikan" /> Bagikan, pilih “Tambahkan ke Layar Utama”, lalu buka SiQura dari ikon kura-kura dan aktifkan notifikasi di sini.</span>
          </span>
        </Alert>
      )}
      {support === 'unsupported' && <Alert tone="warn">Browser ini belum mendukung notifikasi. Gunakan Chrome di Android atau Safari di iPhone (iOS 16.4+).</Alert>}
      {support === 'denied' && <Alert tone="warn">Notifikasi diblokir. Izinkan notifikasi untuk SiQura di pengaturan HP/browser, lalu muat ulang halaman.</Alert>}

      {support === 'ok' && on !== null && (
        on ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => act(sendTestPush, 'Notifikasi tes dikirim. Periksa HP Anda.')}>Kirim tes</Button>
            <Button variant="ghost" disabled={busy} onClick={() => act(async () => { await disablePush(); setOn(false); }, 'Notifikasi dimatikan di perangkat ini.')}>Matikan</Button>
          </div>
        ) : (
          <Button disabled={busy} onClick={() => act(async () => { await enablePush(); setOn(true); }, 'Notifikasi aktif di perangkat ini.')}>
            <Bell size={17} aria-hidden="true" /> {busy ? 'Mengaktifkan…' : 'Aktifkan notifikasi di perangkat ini'}
          </Button>
        )
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </Card>
  );
}
