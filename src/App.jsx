import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui';
import MobileShell from '@/components/layout/MobileShell';
import LoginPage from '@/pages/LoginPage';
import HomePage from '@/pages/HomePage';
import EquipmentListPage from '@/pages/EquipmentListPage';
import QrResolvePage from '@/pages/QrResolvePage';
import AccountPage from '@/pages/AccountPage';
import ComingSoonPage from '@/pages/ComingSoonPage';

function RequireAuth({ children }) {
  const { loading, session, profile } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-dvh items-center justify-center"><Spinner /></div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (profile && !profile.is_active) {
    return <div className="p-6 text-center text-sm text-muted">Akun Anda dinonaktifkan. Hubungi admin laboratorium.</div>;
  }
  return children;
}

function EquipmentDetailPlaceholder() {
  const { id } = useParams();
  return <ComingSoonPage title="Ceklis Alat">Halaman ceklis, matriks bulanan dan riwayat untuk alat ini (ID {id.slice(0, 8)}…).</ComingSoonPage>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/q" element={<RequireAuth><QrResolvePage /></RequireAuth>} />
      <Route element={<RequireAuth><MobileShell /></RequireAuth>}>
        <Route index element={<HomePage />} />
        <Route path="alat" element={<EquipmentListPage />} />
        <Route path="alat/:id" element={<EquipmentDetailPlaceholder />} />
        <Route path="scan" element={<ComingSoonPage title="Scan QR">Sementara ini, pindai stiker QR dengan aplikasi kamera HP — linknya langsung membuka SiQura.</ComingSoonPage>} />
        <Route path="indikator" element={<ComingSoonPage title="Catat Indikator">Pencatatan suhu, tekanan dan kelembapan pagi/sore/malam beserta grafiknya.</ComingSoonPage>} />
        <Route path="akun" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
