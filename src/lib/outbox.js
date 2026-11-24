import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Kotak keluar (outbox): bila sinyal hilang saat menyimpan, data disimpan
 * dulu di HP lalu dikirim otomatis begitu online lagi.
 * Operasi: { kind: 'rpc', fn, args } atau { kind: 'upsert', table, rows, onConflict }
 */
const KEY = 'siqura-outbox-v1';
const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* penyimpanan penuh/diblokir */ }
  snapshot = list.length;
  listeners.forEach((l) => l());
}
let snapshot = typeof localStorage === 'undefined' ? 0 : read().length;

export function isNetworkError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return /Failed to fetch|NetworkError|Load failed|network/i.test(error?.message ?? '');
}

async function send(op) {
  if (op.kind === 'rpc') return supabase.rpc(op.fn, op.args);
  if (op.kind === 'upsert') return supabase.from(op.table).upsert(op.rows, { onConflict: op.onConflict });
  throw new Error('Operasi tidak dikenal');
}

/**
 * Jalankan operasi. Hasil: { data, queued } atau melempar error non-jaringan.
 * Bila jaringan putus, operasi diantrekan dan queued = true.
 */
export async function runOrQueue(op) {
  let res;
  try { res = await send(op); } catch (e) { res = { error: e }; }
  if (!res.error) return { data: res.data, queued: false };
  if (isNetworkError(res.error)) {
    write([...read(), { ...op, queuedAt: new Date().toISOString() }]);
    return { data: null, queued: true };
  }
  throw res.error;
}

let flushing = false;
/** Kirim antrean. Operasi yang ditolak server (bukan masalah jaringan) dibuang & dilaporkan. */
export async function flushOutbox(onRejected) {
  if (flushing) return;
  flushing = true;
  try {
    let list = read();
    while (list.length) {
      const [op, ...rest] = list;
      let res;
      try { res = await send(op); } catch (e) { res = { error: e }; }
      if (res.error && isNetworkError(res.error)) break;
      if (res.error) onRejected?.(op, res.error);
      list = rest;
      write(list);
    }
  } finally {
    flushing = false;
  }
}

export function useOutboxCount() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => snapshot,
    () => 0,
  );
}
