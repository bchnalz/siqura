/** Lingkup daftar kegiatan: satu unit alat, atau satu Jenis Alat. */
export const unitScope = (e) => ({ kind: 'unit', table: 'activities', fk: 'equipment_id', id: e.id, name: e.name, typeId: e.type_id });
export const typeScope = (t) => ({ kind: 'type', table: 'type_activities', fk: 'type_id', id: t.id, name: t.name, unitCount: t.unitCount ?? 0 });
