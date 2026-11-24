import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Badge, Button, Card } from '@/components/ui';
import InstallHint from '@/components/InstallHint';

export default function AccountPage() {
  const { profile, user, signOut, isAdmin } = useAuth();
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-xl font-extrabold">Akun</h1>
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
      <InstallHint />
      <Button variant="outline" onClick={signOut}><LogOut size={18} aria-hidden="true" /> Keluar</Button>
    </div>
  );
}
