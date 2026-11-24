import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Pembaruan aplikasi (PWA).
 * Service worker versi baru menunggu sampai pengguna menekan "Muat ulang",
 * jadi isian yang sedang diketik tidak hilang tiba-tiba.
 */
let needRefresh = false;
let updateSW = () => {};
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

const CHECK_EVERY_MS = 30 * 60 * 1000;

export function initServiceWorker() {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { needRefresh = true; emit(); },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // HP sering membiarkan PWA terbuka berhari-hari: periksa versi baru
      // secara berkala dan setiap kali aplikasi kembali dibuka.
      const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    },
  });
}

export function applyUpdate() {
  // Muat ulang begitu versi baru mengambil alih; cadangan bila tidak ada
  // pergantian (mis. versi baru sudah aktif di tab lain).
  let reloaded = false;
  const reload = () => { if (!reloaded) { reloaded = true; window.location.reload(); } };
  navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
  setTimeout(reload, 4000);
  updateSW(true);
}

export function dismissUpdate() {
  needRefresh = false; emit();
}

export function useNeedRefresh() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => needRefresh,
    () => false,
  );
}
