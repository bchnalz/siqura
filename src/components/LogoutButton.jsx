import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { clearOutbox, useOutboxCount } from '@/lib/outbox';
import { Button } from '@/components/ui';

/** Tombol Keluar dengan konfirmasi. Setelah keluar, halaman masuk dibuka tanpa "halaman tujuan" akun sebelumnya. */
export default function LogoutButton({ className, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>{children}</button>
      {open && createPortal(<ConfirmLogout onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ConfirmLogout({ onClose }) {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const pending = useOutboxCount();
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  // Tutup dengan animasi keluar dulu, baru dilepas dari layar.
  const close = (after = onClose) => { setClosing(true); setTimeout(after, 200); };
  const titleId = useId();
  const cancelRef = useRef(null);

  useEffect(() => {
    const prev = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && !busy && close();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  async function confirm() {
    setBusy(true);
    if (pending) clearOutbox();
    close(async () => {
      await signOut();
      navigate('/login', { replace: true, state: null });
    });
  }

  return (
    <div data-closing={closing || undefined} className="dlg-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && !busy && close()}>
      <div data-closing={closing || undefined} role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="dlg-panel flex w-full max-w-sm flex-col gap-4 rounded-t-3xl bg-white p-5 pb-safe sm:rounded-3xl">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand"><LogOut size={20} aria-hidden="true" /></span>
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-base font-extrabold">Keluar dari SiQura?</h2>
            <p className="text-sm text-muted">
              {profile?.full_name ? <><b className="text-ink">{profile.full_name}</b> akan keluar. </> : null}
              Untuk mencatat lagi, perlu masuk dengan email dan kata sandi.
            </p>
          </div>
        </div>
        {pending > 0 && (
          <p className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm text-bad-strong">
            Ada <b>{pending} catatan belum terkirim</b> karena sinyal. Jika keluar sekarang, catatan itu akan dihapus dari HP ini. Sebaiknya tunggu sampai online.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button ref={cancelRef} type="button" variant="outline" onClick={() => close()} disabled={busy}>Batal</Button>
          <Button type="button" onClick={confirm} disabled={busy} className={pending ? 'bg-bad hover:bg-bad-strong' : undefined}>
            {busy ? 'Keluar…' : 'Ya, keluar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
