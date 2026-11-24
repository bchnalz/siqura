import { NavLink, Outlet, useMatch } from 'react-router-dom';
import {
  BarChart3, ClipboardList, FlaskConical, Home, LineChart, LogOut, QrCode, ScanLine, Settings2, UserRound, Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { Logo } from '@/components/ui';
import { cn } from '@/lib/cn';
import { APP } from '@/config';

/** Satu pintu tata letak: sidebar di desktop (≥1024px), menu bawah di HP. */
export default function AppShell() {
  return useIsDesktop() ? <DesktopShell /> : <MobileShell />;
}

const desktopNav = [
  { to: '/', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/alat', label: 'Ruangan & Alat', icon: FlaskConical },
  { to: '/indikator', label: 'Indikator & Grafik', icon: LineChart },
  { to: '/laporan', label: 'Laporan & Cetak', icon: ClipboardList, soon: true },
  { to: '/qr', label: 'Kartu QR', icon: QrCode, admin: true, soon: true },
  { to: '/master', label: 'Kelola Master', icon: Settings2, admin: true },
  { to: '/petugas', label: 'Akun Petugas', icon: Users, admin: true, soon: true },
];

function DesktopShell() {
  const { isAdmin, profile, signOut } = useAuth();
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col gap-6 bg-brand px-4 py-6 text-white print:hidden">
        <div className="flex items-center gap-2.5">
          <Logo size={40} />
          <div className="flex flex-col">
            <span className="text-xl font-extrabold">{APP.name}</span>
            <span className="text-xs text-on-brand-muted">{APP.tagline}</span>
          </div>
        </div>
        <nav aria-label="Menu utama" className="flex flex-col gap-1">
          {desktopNav.filter((n) => !n.soon && (!n.admin || isAdmin)).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cn('flex h-11 items-center gap-3 rounded-xl px-3 text-sm',
                isActive ? 'bg-brand-tint font-bold text-white' : 'font-semibold text-on-brand-muted hover:bg-brand-tint/60')}>
              <Icon size={18} aria-hidden="true" />{label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <NavLink to="/akun" className="flex items-center gap-2.5 rounded-xl bg-brand-tint/60 px-3 py-2.5">
            <span className="flex size-9 items-center justify-center rounded-full bg-white text-sm font-extrabold text-brand">{profile?.initials || '?'}</span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-bold">{profile?.full_name || 'Akun saya'}</span>
              <span className="text-xs text-on-brand-muted">{isAdmin ? 'Admin' : 'Petugas'}</span>
            </span>
          </NavLink>
          <button onClick={signOut} className="flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-on-brand-muted hover:bg-brand-tint/60">
            <LogOut size={16} aria-hidden="true" /> Keluar
          </button>
          <p className="text-xs leading-relaxed text-on-brand-muted">{APP.unit}</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-ground">
        <div className="mx-auto w-full max-w-6xl px-8 py-6"><Outlet /></div>
      </main>
    </div>
  );
}

const mobileNav = [
  { to: '/', label: 'Beranda', icon: Home, end: true },
  { to: '/alat', label: 'Alat', icon: FlaskConical },
  { to: '/scan', label: 'Scan QR', icon: ScanLine, center: true },
  { to: '/indikator', label: 'Indikator', icon: LineChart },
  { to: '/akun', label: 'Akun', icon: UserRound },
];

function MobileShell() {
  const onEquipment = useMatch('/alat/:id');
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-ground">
      <main className={cn('flex-1', !onEquipment && 'pb-24')}><Outlet /></main>
      {!onEquipment && (
        <nav aria-label="Menu utama" className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-lg border-t border-line bg-white print:hidden">
          <ul className="grid grid-cols-5 items-end">
            {mobileNav.map(({ to, label, icon: Icon, end, center }) => (
              <li key={to} className="flex justify-center">
                {center ? (
                  <NavLink to={to} aria-label={label}
                    className="-mt-6 mb-1 flex size-14 items-center justify-center rounded-[18px] bg-brand text-white shadow-lg shadow-brand/30">
                    <Icon size={26} aria-hidden="true" />
                  </NavLink>
                ) : (
                  <NavLink to={to} end={end}
                    className={({ isActive }) => cn('flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-semibold',
                      isActive ? 'font-bold text-brand' : 'text-subtle')}>
                    <Icon size={22} aria-hidden="true" />{label}
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
