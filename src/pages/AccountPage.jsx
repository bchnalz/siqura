import { Link } from 'react-router-dom';
import { ChevronRight, ClipboardList, LogOut, QrCode, Settings2, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Badge, Button, Card } from '@/components/ui';
import InstallHint from '@/components/InstallHint';

export default function AccountPage() {
  const { profile, user, signOut, isAdmin } = useAuth();
  return (
    <div className="flex flex-col gap-4 p-4 lg:max-w-xl lg:p-0">
      <h1 className="pt-2 text-xl font-extrabold lg:text-2xl">Akun</h1>
      <Card className="flex items-center gap-3 p-4">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-base font-extrabold text-brand">
          {profile?.initials || '?'}
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-[15px] font-bold">{profile?.full_name || user?.email}</span>
          <span className="text-xs text-muted">{user?.email}</span>
        </span>
        <Badge tone={isAdmin ? 'warn' : 'brand'}>{isAdmin ? 'Admin' : 'Petugas'}</Badge>
      </Card>
      {!profile?.initials && (
        <Card className="p-4 text-sm text-muted">Inisial paraf Anda belum diisi. Minta admin melengkapinya.</Card>
      )}
      <nav aria-label="Menu lainnya" className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {[
          { to: '/laporan', icon: ClipboardList, label: 'Laporan & Cetak', sub: 'Form bulanan A4 dan CSV' },
          ...(isAdmin ? [
            { to: '/master', icon: Settings2, label: 'Kelola Master', sub: 'Ruangan, alat, kegiatan, indikator' },
            { to: '/petugas', icon: Users, label: 'Akun Petugas', sub: 'Tambah petugas, peran, kata sandi' },
            { to: '/qr', icon: QrCode, label: 'Kartu QR', sub: 'Cetak & unduh stiker QR alat' },
          ] : []),
        ].map(({ to, icon: Icon, label, sub }) => (
          <Link key={to} to={to} className="flex min-h-14 items-center gap-3 px-4 py-2 text-sm font-semibold hover:bg-ground">
            <Icon size={18} className="text-brand" aria-hidden="true" />
            <span className="flex-1">{label}<span className="block text-xs font-normal text-muted">{sub}</span></span>
            <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
          </Link>
        ))}
      </nav>
      <InstallHint />
      <Button variant="outline" onClick={signOut}><LogOut size={18} aria-hidden="true" /> Keluar</Button>
    </div>
  );
}
