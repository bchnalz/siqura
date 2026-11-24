import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import { isConfigured } from '@/lib/supabase';
import { AuthProvider } from '@/hooks/useAuth';
import App from '@/App';
import './index.css';

registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

// eslint-disable-next-line react-refresh/only-export-components
function NotConfigured() {
  return (
    <div className="mx-auto max-w-md p-6 text-sm leading-relaxed">
      <h1 className="mb-2 text-lg font-bold">SiQura belum terhubung ke database</h1>
      <p>Isi <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> di pengaturan Environment Variables Vercel, lalu deploy ulang.</p>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isConfigured ? (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    ) : <NotConfigured />}
  </StrictMode>,
);
