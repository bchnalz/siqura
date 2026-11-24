import { useSyncExternalStore } from 'react';

/** true bila media query cocok (mis. layar desktop). */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const DESKTOP = '(min-width: 1024px)';
export const useIsDesktop = () => useMediaQuery(DESKTOP);
