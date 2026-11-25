import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Pencil, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { must, useAction } from '@/hooks/useAction';
import { adminUsers, rows } from '@/lib/api';
import { friendlyError, supabase } from '@/lib/supabase';
import { Alert, Badge, Button, Card, Field, Input, Spinner, BlurLoading } from '@/components/ui';

/** Kata sandi sementara yang mudah dibacakan: 3 huruf + 4 angka + 1 huruf besar. */
function tempPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyz', A = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const r = (s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  return `${r(a)}${r(a)}${r(a)}${String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000))}${r(A)}`;
}

export default function StaffPage() {
  const { isAdmin, user } = useAuth();
  const q = useQuery({
    queryKey: ['master', 'profiles'],
    queryFn: () => rows(supabase.from('profiles').select('id,email,full_name,initials,role,is_active,created_at').order('full_name')),
  });
  const [panel, setPanel] = useState(null); // { mode: 'new' } | { mode: 'edit', p } | { mode: 'reset', p }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <h1 className="text-xl font-extrabold lg:text-2xl">Akun Petugas</h1>
        <Button onClick={() => setPanel({ mode: 'new' })}><UserPlus size={17} aria-hidden="true" /> Tambah petugas</Button>
      </div>
      {q.error && <Alert>{friendlyError(q.error)}</Alert>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <Card className="overflow-hidden">
          {q.isPending ? <BlurLoading /> : (
            <ul className="divide-y divide-line">
              {q.data.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold text-brand">{p.initials || '?'}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-bold">{p.full_name || '(nama belum diisi)'}{p.id === user.id && <span className="font-normal text-muted"> · Anda</span>}</span>
                    <span className="truncate text-xs text-muted">{p.email}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                    <Badge tone={p.role === 'admin' ? 'warn' : 'brand'}>{p.role === 'admin' ? 'Admin' : 'Petugas'}</Badge>
                    {!p.is_active && <Badge tone="bad">Nonaktif</Badge>}
                  </span>
                  <Button variant="ghost" size="sm" aria-label={`Ubah ${p.full_name || p.email}`} onClick={() => setPanel({ mode: 'edit', p })}><Pencil size={15} aria-hidden="true" /></Button>
                  <Button variant="ghost" size="sm" aria-label={`Atur ulang kata sandi ${p.full_name || p.email}`} onClick={() => setPanel({ mode: 'reset', p })}><KeyRound size={15} aria-hidden="true" /></Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="lg:sticky lg:top-6">
          {panel?.mode === 'new' && <NewStaff key="new" onDone={() => setPanel(null)} />}
          {panel?.mode === 'edit' && <EditStaff key={panel.p.id} p={panel.p} self={panel.p.id === user.id} onDone={() => setPanel(null)} />}
          {panel?.mode === 'reset' && <ResetPassword key={`r-${panel.p.id}`} p={panel.p} onDone={() => setPanel(null)} />}
          {!panel && <Card className="hidden p-4 text-sm text-muted lg:block">Tambah petugas baru, atau pilih ikon pensil untuk mengubah nama, inisial, peran dan status.</Card>}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <Card className="flex flex-col gap-3 border-2 border-brand p-4">
      <h2 className="text-[15px] font-extrabold">{title}</h2>
      {children}
    </Card>
  );
}

function NewStaff({ onDone }) {
  const { run, busy, error } = useAction();
  const [f, setF] = useState({ full_name: '', initials: '', email: '', password: tempPassword(), role: 'petugas' });
  const [created, setCreated] = useState(null);

  async function save(e) {
    e.preventDefault();
    const ok = await run(() => adminUsers({ action: 'create', ...f }));
    if (ok) setCreated({ email: f.email.trim().toLowerCase(), password: f.password });
  }

  if (created) {
    return (
      <Panel title="Akun dibuat">
        <p className="text-sm">Berikan data masuk ini kepada petugas. Kata sandi tidak bisa dilihat lagi setelah panel ini ditutup.</p>
        <dl className="tnum grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-ground p-3 text-sm">
          <dt className="text-muted">Email</dt><dd className="font-bold break-all">{created.email}</dd>
          <dt className="text-muted">Kata sandi</dt><dd className="font-mono font-bold">{created.password}</dd>
        </dl>
        <Button onClick={onDone}>Selesai</Button>
      </Panel>
    );
  }
  return (
    <Panel title="Tambah petugas">
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Nama lengkap"><Input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Inisial paraf" hint="2–3 huruf, muncul di ceklis & laporan.">
          <Input required maxLength={4} value={f.initials} onChange={(e) => setF({ ...f, initials: e.target.value.toUpperCase() })} className="w-28 uppercase" />
        </Field>
        <Field label="Email"><Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Kata sandi sementara" hint="Minimal 8 karakter.">
          <div className="flex gap-2">
            <Input required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="font-mono" />
            <Button type="button" variant="outline" onClick={() => setF({ ...f, password: tempPassword() })}>Acak</Button>
          </div>
        </Field>
        <Field label="Peran">
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="h-12 rounded-xl border border-field bg-white px-3 text-[15px]">
            <option value="petugas">Petugas: mengisi ceklis & indikator</option>
            <option value="admin">Admin: juga mengelola master & akun</option>
          </select>
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">{busy ? 'Membuat akun…' : 'Buat akun'}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>Batal</Button>
        </div>
      </form>
    </Panel>
  );
}

function EditStaff({ p, self, onDone }) {
  const { run, busy, error } = useAction();
  const [f, setF] = useState({ full_name: p.full_name ?? '', initials: p.initials ?? '', role: p.role, is_active: p.is_active });
  async function save(e) {
    e.preventDefault();
    const ok = await run(async () => {
      await must(supabase.from('profiles').update({ full_name: f.full_name.trim(), initials: f.initials.trim().toUpperCase() }).eq('id', p.id));
      if (f.role !== p.role || f.is_active !== p.is_active) {
        await must(supabase.rpc('admin_set_profile', { p_id: p.id, p_role: f.role, p_active: f.is_active }));
      }
    });
    if (ok) onDone();
  }
  return (
    <Panel title={`Ubah ${p.full_name || p.email}`}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Nama lengkap"><Input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Inisial paraf"><Input required maxLength={4} value={f.initials} onChange={(e) => setF({ ...f, initials: e.target.value.toUpperCase() })} className="w-28 uppercase" /></Field>
        <Field label="Peran">
          <select value={f.role} disabled={self} onChange={(e) => setF({ ...f, role: e.target.value })} className="h-12 rounded-xl border border-field bg-white px-3 text-[15px] disabled:opacity-60">
            <option value="petugas">Petugas</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
          <input type="checkbox" checked={f.is_active} disabled={self} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="size-5 accent-brand" />
          Akun aktif
        </label>
        {self && <p className="text-xs text-muted">Peran dan status akun Anda sendiri tidak bisa diubah dari sini.</p>}
        {!f.is_active && !self && <Alert tone="warn">Petugas nonaktif tidak bisa masuk atau melihat data. Riwayat isiannya tetap tersimpan.</Alert>}
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">{busy ? 'Menyimpan…' : 'Simpan'}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>Batal</Button>
        </div>
      </form>
    </Panel>
  );
}

function ResetPassword({ p, onDone }) {
  const { run, busy, error } = useAction();
  const [pw, setPw] = useState(tempPassword());
  const [done, setDone] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (await run(() => adminUsers({ action: 'reset_password', user_id: p.id, password: pw }))) setDone(true);
  }
  return (
    <Panel title={`Kata sandi baru · ${p.full_name || p.email}`}>
      {done ? (
        <>
          <p className="text-sm">Kata sandi baru untuk <b>{p.email}</b>:</p>
          <p className="rounded-xl bg-ground p-3 font-mono text-base font-bold">{pw}</p>
          <Button onClick={onDone}>Selesai</Button>
        </>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-3">
          <Field label="Kata sandi baru" hint="Minimal 8 karakter. Berikan langsung kepada petugas.">
            <div className="flex gap-2">
              <Input required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} className="font-mono" />
              <Button type="button" variant="outline" onClick={() => setPw(tempPassword())}>Acak</Button>
            </div>
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="flex-1">{busy ? 'Menyimpan…' : 'Atur ulang'}</Button>
            <Button type="button" variant="ghost" onClick={onDone}>Batal</Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
