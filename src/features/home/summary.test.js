import { describe, expect, it } from 'vitest';
import { buildHomeSummary } from './summary';

const today = '2026-11-24';
const rooms = [{ id: 'r1', name: 'Laboratorium TBC' }, { id: 'r2', name: 'Ruang Media' }];
const equipment = [{ id: 'e1', room_id: 'r1', name: 'BSC-II A' }];
const statuses = [
  { activity_id: 'a1', equipment_id: 'e1', room_id: 'r1', last_done: today, next_due: '2026-11-25' },
  { activity_id: 'a2', equipment_id: 'e1', room_id: 'r1', last_done: '2026-11-23', next_due: today },
  { activity_id: 'a3', equipment_id: 'e1', room_id: 'r1', last_done: '2026-10-21', next_due: '2026-11-20', name: 'Cek UV' },
  { activity_id: 'a4', equipment_id: 'e1', room_id: 'r1', last_done: '2026-11-18', next_due: '2026-11-25' },
];
const hum = { id: 'i1', name: 'Kelembapan', unit: '%RH', shifts: ['pagi', 'sore', 'malam'] };
const temp = { id: 'i2', name: 'Suhu', unit: '°C', shifts: ['pagi'] };
const targets = [
  { id: 't1', room_id: 'r1', indicator: hum },
  { id: 't2', room_id: 'r1', indicator: temp },
];

describe('ringkasan beranda', () => {
  const s = buildHomeSummary({
    rooms, equipment, statuses, targets, today, shift: 'sore',
    readings: [{ target_id: 't1', shift: 'pagi', value: 50 }],
  });
  it('menghitung tugas & keterlambatan', () => {
    expect(s.tasksToday).toBe(3);
    expect(s.lateCount).toBe(1);
    expect(s.lateItems[0]).toMatchObject({ name: 'Cek UV', days: 4, equipmentName: 'BSC-II A', roomName: 'Laboratorium TBC' });
    expect(s.roomProgress).toHaveLength(1);
    expect(s.roomProgress[0]).toMatchObject({ done: 1, total: 3, late: 1 });
  });
  it('kartu ruangan memakai status seragam', () => {
    const c = s.roomCards.find((x) => x.room.id === 'r1');
    const hum = c.items.find((i) => i.indicator.name === 'Kelembapan');
    expect(hum.slots.pagi.status).toBe('recorded');
    expect(hum.slots.sore.status).toBe('pending');
    expect(hum.slots.malam.status).toBe('upcoming');
    expect(c.items.find((i) => i.indicator.name === 'Suhu').slots.pagi.status).toBe('missed');
    expect(c.state.label).toBe('1 belum dicatat');
    expect(s.roomCards[0].checklist).toMatchObject({ done: 1, total: 3 });
    expect(s.roomCards.map((x) => x.room.id)).toEqual(['r1']);
  });
  it('indikator hanya yang dijadwalkan di shift ini', () => {
    expect(s.pendingIndicators).toBe(1);
    expect(s.indicatorCards[0].items.map((i) => i.indicator.name)).toEqual(['Kelembapan']);
  });
});
