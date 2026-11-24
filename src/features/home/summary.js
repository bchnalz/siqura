import { dueStatus } from '@/lib/dates';

/**
 * Ringkasan Beranda dari data mentah (fungsi murni, mudah diuji).
 * - Tugas hari ini = kegiatan jatuh tempo/terlambat + yang sudah selesai hari ini
 * - Indikator belum dicatat = target yang dijadwalkan di shift ini tanpa catatan
 */
export function buildHomeSummary({ rooms, equipment, statuses, targets, readings, today, shift }) {
  const eqById = new Map(equipment.map((e) => [e.id, e]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  const perRoom = new Map(rooms.map((r) => [r.id, { room: r, done: 0, due: 0, late: 0, equipmentCount: 0 }]));
  for (const e of equipment) perRoom.get(e.room_id) && perRoom.get(e.room_id).equipmentCount++;

  let tasksToday = 0, lateCount = 0;
  const lateItems = [];
  for (const s of statuses) {
    const st = dueStatus(s, today);
    const bucket = perRoom.get(s.room_id);
    if (!bucket) continue;
    if (st.key === 'done') { bucket.done++; tasksToday++; }
    else if (st.key === 'today' || st.key === 'late') {
      bucket.due++; tasksToday++;
      if (st.key === 'late') {
        bucket.late++; lateCount++;
        const eq = eqById.get(s.equipment_id);
        lateItems.push({ ...s, days: st.days, equipmentName: eq?.name, roomName: roomById.get(s.room_id)?.name });
      }
    }
  }
  lateItems.sort((a, b) => b.days - a.days);

  const readingByTarget = new Map(readings.filter((r) => r.shift === shift).map((r) => [r.target_id, r]));
  const indicatorRooms = new Map();
  let pendingIndicators = 0;
  for (const t of targets) {
    if (!t.room_id || !t.indicator?.shifts?.includes(shift)) continue;
    const reading = readingByTarget.get(t.id) ?? null;
    if (!reading) pendingIndicators++;
    if (!indicatorRooms.has(t.room_id)) indicatorRooms.set(t.room_id, { room: roomById.get(t.room_id), items: [] });
    indicatorRooms.get(t.room_id).items.push({ target: t, indicator: t.indicator, reading });
  }
  const indicatorCards = [...indicatorRooms.values()]
    .filter((c) => c.room)
    .map((c) => ({ ...c, complete: c.items.every((i) => i.reading), anyOut: c.items.some((i) => i.reading?.is_out_of_range) }));

  const roomProgress = [...perRoom.values()]
    .filter((p) => p.equipmentCount > 0)
    .map((p) => ({ ...p, total: p.done + p.due, pct: p.done + p.due ? Math.round((p.done / (p.done + p.due)) * 100) : 100 }));

  return { tasksToday, lateCount, pendingIndicators, lateItems, indicatorCards, roomProgress };
}
