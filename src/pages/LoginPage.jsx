import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { friendlyError } from '@/lib/supabase';
import { Alert, Button, Field, Input, Logo } from '@/components/ui';
import InstallHint from '@/components/InstallHint';

export default function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = location.state?.from || '/';

  if (session) return <Navigate to={next} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error: err } = await signIn(email.trim(), password);
    setBusy(false);
    if (err) setError(friendlyError(err));
    else navigate(next, { replace: true });
  }

  return (
    <div className="flex min-h-dvh bg-brand lg:items-center lg:justify-center lg:bg-ground lg:p-8">
     <div className="mx-auto flex w-full max-w-lg flex-col lg:max-w-4xl lg:flex-row lg:overflow-hidden lg:rounded-3xl lg:shadow-[0_24px_60px_rgba(19,32,31,0.16)]">
      <header className="on-brand flex flex-col gap-4 bg-brand px-7 pt-14 pb-8 text-white lg:w-[44%] lg:justify-center lg:px-12 lg:py-16">
        <div className="flex items-center gap-3">
          <Logo size={52} />
          <h1 className="text-[34px] font-extrabold tracking-tight">SiQura</h1>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-on-brand-muted">Sistem QR Ruangan dan Alat</p>
          <p className="text-[13px] leading-relaxed text-on-brand-muted">Laboratorium Mikrobiologi Klinik dan Biomolekuler</p>
        </div>
      </header>

      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 rounded-t-[28px] bg-white px-6 pt-7 pb-8 lg:rounded-none lg:px-12 lg:py-14">
        <div>
          <h2 className="text-xl font-bold lg:text-2xl">Masuk</h2>
          <p className="text-[13px] text-muted">Gunakan akun yang dibuatkan admin.</p>
        </div>
        {location.state?.from?.startsWith('/q') && (
          <Alert tone="brand">Masuk dulu, lalu halaman alat dari QR akan langsung terbuka.</Alert>
        )}
        <Field label="Email">
          <Input type="email" autoComplete="username" inputMode="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
        </Field>
        <Field label="Kata sandi">
          <Input type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</Button>
        <p className="text-center text-xs text-muted">Lupa kata sandi? Hubungi admin laboratorium.</p>
        <InstallHint className="mt-auto" />
      </form>
     </div>
    </div>
  );
}
