import { NavLink, Outlet } from 'react-router-dom';
import { Home, FlaskConical, ScanLine, LineChart, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';

const items = [
  { to: '/', label: 'Beranda', icon: Home, end: true },
  { to: '/alat', label: 'Alat', icon: FlaskConical },
  { to: '/scan', label: 'Scan QR', icon: ScanLine, center: true },
  { to: '/indikator', label: 'Indikator', icon: LineChart },
  { to: '/akun', label: 'Akun', icon: UserRound },
];

export default function MobileShell() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-ground">
      <main className="flex-1 pb-24"><Outlet /></main>
      <nav aria-label="Menu utama" className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-lg border-t border-line bg-white">
        <ul className="grid grid-cols-5 items-end">
          {items.map(({ to, label, icon: Icon, end, center }) => (
            <li key={to} className="flex justify-center">
              {center ? (
                <NavLink to={to} aria-label={label}
                  className="-mt-6 mb-1 flex size-14 items-center justify-center rounded-[18px] bg-brand text-white shadow-lg shadow-brand/30">
                  <Icon size={26} aria-hidden="true" />
                </NavLink>
              ) : (
                <NavLink to={to} end={end}
                  className={({ isActive }) => cn('flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
                    isActive ? 'text-brand font-bold' : 'text-subtle')}>
                  <Icon size={22} aria-hidden="true" />{label}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
