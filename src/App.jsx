import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui';
import AppShell from '@/components/layout/AppShell';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import SyncBanner from '@/components/SyncBanner';
import UpdatePrompt from '@/components/UpdatePrompt';
import LoginPage from '@/pages/LoginPage';
import HomePage from '@/pages/HomePage';
import EquipmentListPage from '@/pages/EquipmentListPage';
import EquipmentPage from '@/pages/EquipmentPage';
import IndicatorPage from '@/pages/IndicatorPage';
import QrResolvePage from '@/pages/QrResolvePage';
import AccountPage from '@/pages/AccountPage';

const ScanPage = lazy(() => import('@/pages/ScanPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const MasterPage = lazy(() => import('@/pages/master/MasterPage'));
const StaffPage = lazy(() => import('@/pages/StaffPage'));
const QrCardsPage = lazy(() => import('@/pages/QrCardsPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const Loading = () => <div className="flex min-h-[50dvh] items-center justify-center"><Spinner /></div>;

function RequireAuth({ children }) {
  const { loading, session, profile } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (profile && !profile.is_active) {
    return <div className="p-6 text-center text-sm text-muted">Akun Anda dinonaktifkan. Hubungi admin laboratorium.</div>;
  }
  return children;
}

function Home() {
  return useIsDesktop() ? <DashboardPage /> : <HomePage />;
}

export default function App() {
  return (
    <>
      <SyncBanner />
      <UpdatePrompt />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/q" element={<RequireAuth><QrResolvePage /></RequireAuth>} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<Home />} />
            <Route path="alat/:id" element={<EquipmentPage />} />
            <Route path="master" element={<MasterPage />} />
            <Route path="petugas" element={<StaffPage />} />
            <Route path="qr" element={<QrCardsPage />} />
            <Route path="laporan" element={<ReportsPage />} />
            <Route path="alat" element={<EquipmentListPage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="indikator" element={<IndicatorPage />} />
            <Route path="akun" element={<AccountPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
