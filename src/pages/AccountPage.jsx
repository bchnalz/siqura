import { Link } from 'react-router-dom';
import { ChevronRight, LogOut, Settings2 } from 'lucide-react';
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
      {isAdmin && (
        <nav aria-label="Menu admin" className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
          <h2 className="px-4 pt-3 pb-1 text-xs font-bold text-muted">Admin</h2>
          <Link to="/master" className="flex min-h-14 items-center gap-3 px-4 text-sm font-semibold hover:bg-ground">
            <Settings2 size={18} className="text-brand" aria-hidden="true" />
            <span className="flex-1">Kelola Master<span className="block text-xs font-normal text-muted">Ruangan, alat, kegiatan, indikator</span></span>
            <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
          </Link>
        </nav>
      )}
      <InstallHint />
      <Button variant="outline" onClick={signOut}><LogOut size={18} aria-hidden="true" /> Keluar</Button>
    </div>
  );
}
