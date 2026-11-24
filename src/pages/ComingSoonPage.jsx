import { Link } from 'react-router-dom';
import { Card } from '@/components/ui';

/** Penanda sementara untuk layar yang dikerjakan di tahap berikutnya. */
export default function ComingSoonPage({ title, children }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-xl font-extrabold">{title}</h1>
      <Card className="flex flex-col gap-2 p-4 text-sm text-muted">
        <span className="font-bold text-ink">Sedang dibangun (tahap 2)</span>
        {children}
        <Link to="/" className="font-semibold text-brand">Kembali ke Beranda</Link>
      </Card>
    </div>
  );
}
