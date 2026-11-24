import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Ajakan memasang SiQura ke layar utama (Android: tombol, iPhone: petunjuk). */
export default function InstallHint({ className }) {
  const [prompt, setPrompt] = useState(null);
  const [hidden, setHidden] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setPrompt(e); };
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden || (!prompt && !isIos())) return null;

  return (
    <div className={cn('flex items-center gap-3 rounded-2xl bg-brand-soft px-3.5 py-3', className)}>
      <Smartphone className="shrink-0 text-brand" size={22} aria-hidden="true" />
      <p className="flex-1 text-xs leading-relaxed text-[#2D3B3A]">
        {prompt
          ? 'Pasang SiQura di layar utama HP agar bisa dibuka seperti aplikasi dan menerima notifikasi.'
          : 'iPhone: ketuk tombol Bagikan di Safari, lalu “Tambahkan ke Layar Utama”.'}
      </p>
      {prompt && (
        <Button size="sm" onClick={async () => { prompt.prompt(); await prompt.userChoice; setPrompt(null); }}>
          Pasang
        </Button>
      )}
    </div>
  );
}
