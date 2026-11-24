import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QrScanner from 'qr-scanner';
import { Camera } from 'lucide-react';
import { Alert, Card } from '@/components/ui';
import { qrToRoute } from '@/lib/qr';

export default function ScanPage() {
  const video = useRef(null);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [wrong, setWrong] = useState('');

  useEffect(() => {
    const el = video.current;
    const scanner = new QrScanner(el, (result) => {
      const route = qrToRoute(result.data);
      if (route) { scanner.stop(); navigate(route); }
      else setWrong('QR ini bukan QR SiQura.');
    }, { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true });
    scanner.start().catch(() => setError('Kamera tidak bisa dibuka. Izinkan akses kamera untuk SiQura di pengaturan browser, atau pindai QR dengan aplikasi kamera HP.'));
    return () => { scanner.stop(); scanner.destroy(); };
  }, [navigate]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="pt-2 text-xl font-extrabold">Scan QR</h1>
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-ink">
        <video ref={video} className="size-full object-cover" muted playsInline />
        {error && <div className="absolute inset-0 flex items-center justify-center text-white/70"><Camera size={48} aria-hidden="true" /></div>}
      </div>
      {error && <Alert>{error}</Alert>}
      {wrong && !error && <Alert tone="warn">{wrong}</Alert>}
      <Card className="p-3.5 text-[13px] text-muted">
        Arahkan kamera ke stiker QR pada alat. Halaman ceklis alat akan terbuka otomatis.
      </Card>
    </div>
  );
}
